import { GetCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { ddbDocClient } from "../shared/dynamodb";
import { requireScope, validateUserOrAdmin } from "../shared/auth";
import { handleError, formatResponse } from "../shared/errors";

const TABLE_USER_LISTS = process.env.TABLE_USER_LISTS;

export const handler = async (event: any) => {
  try {
    // Validate scope
    requireScope(event, "mylist:write");

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
        TableName: TABLE_USER_LISTS,
        Key: { userId, movieId },
      })
    );

    if (!getResult.Item) {
      const error: any = new Error(`NotFound: Movie with ID '${movieId}' not found in user list`);
      error.resourceType = "UserList";
      error.resourceId = `${userId}#${movieId}`;
      throw error;
    }

    // 2. Delete user list entry
    await ddbDocClient.send(
      new DeleteCommand({
        TableName: TABLE_USER_LISTS,
        Key: { userId, movieId },
      })
    );

    return formatResponse(204);
  } catch (error) {
    return handleError(error);
  }
};
