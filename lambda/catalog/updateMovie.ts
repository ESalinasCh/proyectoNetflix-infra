import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddbDocClient } from "../shared/dynamodb";
import { requireScope, requireRole } from "../shared/auth";
import { handleError, formatResponse } from "../shared/errors";

const TABLE_MOVIES = process.env.TABLE_MOVIES;

export const handler = async (event: any) => {
  try {
    // Validate scope and role
    requireScope(event, "catalog:write");
    requireRole(event, ["content_admin", "super_admin"]);

    const movieId = event.pathParameters?.movieId;
    if (!movieId) {
      throw new Error("Validation: Missing movieId in path parameters");
    }

    const body = event.body ? JSON.parse(event.body) : {};

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

    // 2. Build Update Expression dynamically
    const fields = ["title", "synopsis", "genreId", "director", "releaseYear", "durationMinutes", "posterUrl"];
    let updateExpression = "set updatedAt = :updatedAt";
    const expressionAttributeValues: any = {
      ":updatedAt": new Date().toISOString(),
    };
    const expressionAttributeNames: any = {};

    fields.forEach((field) => {
      if (body[field] !== undefined) {
        updateExpression += `, #${field} = :${field}`;
        expressionAttributeValues[`:${field}`] = field === "releaseYear" || field === "durationMinutes" 
          ? parseInt(body[field]) 
          : body[field];
        expressionAttributeNames[`#${field}`] = field;
      }
    });

    const updateResult = await ddbDocClient.send(
      new UpdateCommand({
        TableName: TABLE_MOVIES,
        Key: { movieId },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: "ALL_NEW",
      })
    );

    return formatResponse(200, {
      movie: updateResult.Attributes,
    });
  } catch (error) {
    return handleError(error);
  }
};
