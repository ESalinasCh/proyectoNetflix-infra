import { GetCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { ddbDocClient } from "../shared/dynamodb";
import { requireScope, requireRole } from "../shared/auth";
import { handleError, formatResponse } from "../shared/errors";

const TABLE_MOVIES = process.env.TABLE_MOVIES;

export const handler = async (event: any) => {
  try {
    // Validate scope and role
    requireScope(event, "catalog:delete");
    requireRole(event, ["super_admin"]);

    const movieId = event.pathParameters?.movieId;
    if (!movieId) {
      throw new Error("Validation: Missing movieId in path parameters");
    }

    // 1. Verify existence
    const getResult = await ddbDocClient.send(
      new GetCommand({
        TableName: TABLE_MOVIES,
        Key: { movieId },
      })
    );

    if (!getResult.Item) {
      const error: any = new Error(`NotFound: Movie with ID '${movieId}' not found`);
      error.resourceType = "Movie";
      error.resourceId = movieId;
      throw error;
    }

    // 2. Delete item
    await ddbDocClient.send(
      new DeleteCommand({
        TableName: TABLE_MOVIES,
        Key: { movieId },
      })
    );

    return formatResponse(204);
  } catch (error) {
    return handleError(error);
  }
};
