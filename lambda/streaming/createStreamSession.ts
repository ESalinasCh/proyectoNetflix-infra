import { PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { ddbDocClient } from "../shared/dynamodb";
import { requireScope, getAuthContext } from "../shared/auth";
import { handleError, formatResponse } from "../shared/errors";
import { randomUUID } from "crypto";

const TABLE_MOVIES = process.env.TABLE_MOVIES;
const TABLE_STREAM_SESSIONS = process.env.TABLE_STREAM_SESSIONS;

export const handler = async (event: any) => {
  try {
    // Validate scope and get auth context
    requireScope(event, "catalog:read");
    const auth = getAuthContext(event);

    const body = event.body ? JSON.parse(event.body) : {};
    const { movieId, preferredQuality } = body;
    if (!movieId) {
      throw new Error("Validation: Missing movieId in request body");
    }

    // 1. Verify movie exists
    const movieResult = await ddbDocClient.send(
      new GetCommand({
        TableName: TABLE_MOVIES,
        Key: { movieId },
      })
    );

    if (!movieResult.Item) {
      const error: any = new Error(`NotFound: Movie with ID '${movieId}' not found`);
      error.resourceType = "Movie";
      error.resourceId = movieId;
      throw error;
    }

    // 2. Determine video quality
    const quality = preferredQuality || "1080p";

    // 3. Retrieve actual HLS playlist URL from DynamoDB video_assets if registered
    let playlistUrl = "";
    try {
      const assetResult = await ddbDocClient.send(
        new GetCommand({
          TableName: process.env.TABLE_VIDEO_ASSETS,
          Key: { movieId, quality },
        })
      );
      if (assetResult.Item && assetResult.Item.hlsPlaylistUrl) {
        playlistUrl = assetResult.Item.hlsPlaylistUrl;
      }
    } catch (dbErr) {
      console.warn("Failed to retrieve asset from video_assets table:", dbErr);
    }

    const now = new Date();
    const expiresDate = new Date(now.getTime() + 4 * 60 * 60 * 1000); // 4 hours TTL

    // Fallback to mock CDN URL if no asset is registered in DynamoDB
    const signedUrl = playlistUrl || `https://cdn.netflix-clone.com/movies/${movieId}/${quality}/playlist.m3u8?Expires=${Math.floor(expiresDate.getTime() / 1000)}&Signature=mock_sig_${randomUUID()}&Key-Pair-Id=K123456789`;

    const sessionId = randomUUID();

    const session = {
      sessionId,
      userId: auth.userId,
      movieId,
      signedUrl,
      quality,
      expiresAt: expiresDate.toISOString(),
      createdAt: now.toISOString(),
    };

    // 4. Save stream session in DynamoDB
    await ddbDocClient.send(
      new PutCommand({
        TableName: TABLE_STREAM_SESSIONS,
        Item: session,
      })
    );

    return formatResponse(201, {
      sessionId,
      signedUrl,
      quality,
      expiresAt: session.expiresAt,
    });
  } catch (error) {
    return handleError(error);
  }
};
