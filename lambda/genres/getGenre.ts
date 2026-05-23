import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { ddbDocClient } from "../shared/dynamodb";
import { requireScope } from "../shared/auth";
import { handleError, formatResponse } from "../shared/errors";

const TABLE_GENRES = process.env.TABLE_GENRES;

export const handler = async (event: any) => {
  try {
    // Validate scope
    requireScope(event, "catalog:read");

    const genreId = event.pathParameters?.genreId;
    if (!genreId) {
      throw new Error("Validation: Missing genreId in path parameters");
    }

    const result = await ddbDocClient.send(
      new GetCommand({
        TableName: TABLE_GENRES,
        Key: { genreId },
      })
    );

    if (!result.Item) {
      const error: any = new Error(`NotFound: Genre with ID '${genreId}' not found`);
      error.resourceType = "Genre";
      error.resourceId = genreId;
      throw error;
    }

    return formatResponse(200, {
      genre: result.Item,
    });
  } catch (error) {
    return handleError(error);
  }
};
