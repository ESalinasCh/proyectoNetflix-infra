import { PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { ddbDocClient } from "../shared/dynamodb";
import { requireScope, validateUserOrAdmin } from "../shared/auth";
import { handleError, formatResponse } from "../shared/errors";

const TABLE_MOVIES = process.env.TABLE_MOVIES;
const TABLE_USER_LISTS = process.env.TABLE_USER_LISTS;

export const handler = async (event: any) => {
  try {
    // Validate scope
    requireScope(event, "mylist:write");

    const userId = event.pathParameters?.userId;
    if (!userId) {
      throw new Error("Validation: Missing userId in path parameters");
    }

    // Enforce owner check
    validateUserOrAdmin(event, userId);

    const body = event.body ? JSON.parse(event.body) : {};
    const { movieId, notes } = body;
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

    // 2. Put user_lists entry
    const entry = {
      userId,
      movieId,
      notes: notes || "",
      addedAt: new Date().toISOString(),
    };

    await ddbDocClient.send(
      new PutCommand({
        TableName: TABLE_USER_LISTS,
        Item: entry,
      })
    );

    return formatResponse(201, { entry });
  } catch (error) {
    return handleError(error);
  }
};
