import { GetCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { ddbDocClient } from "../shared/dynamodb";
import { requireScope, validateUserOrAdmin } from "../shared/auth";
import { handleError, formatResponse } from "../shared/errors";

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

    // Validate ownership
    validateUserOrAdmin(event, userId);

    // 1. Verify existence
    const getResult = await ddbDocClient.send(
      new GetCommand({
        TableName: TABLE_WATCH_HISTORY,
        Key: { userId, movieId },
      })
    );

    if (!getResult.Item) {
      const error: any = new Error(`NotFound: Movie with ID '${movieId}' not found in user watch history`);
      error.resourceType = "WatchHistory";
      error.resourceId = `${userId}#${movieId}`;
      throw error;
    }

    // 2. Delete watch history entry
    await ddbDocClient.send(
      new DeleteCommand({
        TableName: TABLE_WATCH_HISTORY,
        Key: { userId, movieId },
      })
    );

    return formatResponse(204);
  } catch (error) {
    return handleError(error);
  }
};
