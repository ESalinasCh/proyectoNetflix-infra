import { PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { ddbDocClient } from "../shared/dynamodb";
import { requireScope, validateUserOrAdmin } from "../shared/auth";
import { handleError, formatResponse } from "../shared/errors";

const TABLE_MOVIES = process.env.TABLE_MOVIES;
const TABLE_WATCH_HISTORY = process.env.TABLE_WATCH_HISTORY;

export const handler = async (event: any) => {
  try {
    // Validate scope
    requireScope(event, "history:write");

    const userId = event.pathParameters?.userId;
    const movieId = event.pathParameters?.movieId;
    if (!userId || !movieId) {
      throw new Error("Validation: Missing userId or movieId in path parameters");
    }

    // Enforce ownership
    validateUserOrAdmin(event, userId);

    const body = event.body ? JSON.parse(event.body) : {};
    const { progressSeconds, completed } = body;
    if (progressSeconds === undefined) {
      throw new Error("Validation: Missing progressSeconds in request body");
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

    // 2. Update entry in DynamoDB
    const entry = {
      userId,
      movieId,
      progressSeconds: parseInt(progressSeconds),
      completed: completed !== undefined ? completed : false,
      lastWatchedAt: new Date().toISOString(),
    };

    await ddbDocClient.send(
      new PutCommand({
        TableName: TABLE_WATCH_HISTORY,
        Item: entry,
      })
    );

    return formatResponse(200, { entry });
  } catch (error) {
    return handleError(error);
  }
};
