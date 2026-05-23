import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { ddbDocClient } from "../shared/dynamodb";

const TABLE_MOVIES = process.env.TABLE_MOVIES;
const TABLE_VIDEO_ASSETS = process.env.TABLE_VIDEO_ASSETS;

export const handler = async (event: any) => {
  console.log("Received MediaConvert EventBridge event:", JSON.stringify(event, null, 2));

  try {
    const status = event.detail?.status;
    const movieId = event.detail?.userMetadata?.movieId;

    if (!movieId) {
      console.warn("No movieId found in EventBridge metadata. Skipping callback.");
      return;
    }

    // Retrieve movie details
    const movieResult = await ddbDocClient.send(
      new GetCommand({
        TableName: TABLE_MOVIES,
        Key: { movieId },
      })
    );

    if (!movieResult.Item) {
      console.warn(`Movie ${movieId} not found in DynamoDB. Skipping callback.`);
      return;
    }

    if (status === "COMPLETE") {
      console.log(`MediaConvert job completed for movie ${movieId}. Updating status...`);

      // Update movie status to ready
      const updatedMovie = {
        ...movieResult.Item,
        videoStatus: "ready",
        updatedAt: new Date().toISOString(),
      };

      await ddbDocClient.send(
        new PutCommand({
          TableName: TABLE_MOVIES,
          Item: updatedMovie,
        })
      );

      // Register video assets
      const bucketTranscoded = process.env.BUCKET_TRANSCODED_VIDEOS || "transcoded-videos";
      const qualities = ["480p", "720p", "1080p"];

      for (const quality of qualities) {
        await ddbDocClient.send(
          new PutCommand({
            TableName: TABLE_VIDEO_ASSETS,
            Item: {
              movieId,
              quality,
              hlsPlaylistUrl: `https://${bucketTranscoded}.s3.amazonaws.com/movies/${movieId}/output_${quality}.m3u8`,
              fileSizeBytes: 104857600, // 100MB
              bitrateKbps: quality === "1080p" ? 5000 : quality === "720p" ? 2500 : 1000,
              createdAt: new Date().toISOString(),
            },
          })
        );
      }

      console.log(`Movie ${movieId} video assets registered successfully.`);
    } else if (status === "ERROR") {
      console.error(`MediaConvert job failed for movie ${movieId}. Updating status to error.`);
      
      const updatedMovie = {
        ...movieResult.Item,
        videoStatus: "error",
        updatedAt: new Date().toISOString(),
      };

      await ddbDocClient.send(
        new PutCommand({
          TableName: TABLE_MOVIES,
          Item: updatedMovie,
        })
      );
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Callback executed successfully" }),
    };
  } catch (error) {
    console.error("Error in transcodeCallback handler:", error);
    throw error;
  }
};
