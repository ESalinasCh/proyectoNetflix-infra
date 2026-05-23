import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddbDocClient } from "../shared/dynamodb";
import { requireScope } from "../shared/auth";
import { handleError, formatResponse } from "../shared/errors";

const TABLE_MOVIES = process.env.TABLE_MOVIES;

export const handler = async (event: any) => {
  try {
    // Validate scope
    requireScope(event, "catalog:read");

    const genreId = event.pathParameters?.genreId;
    if (!genreId) {
      throw new Error("Validation: Missing genreId in path parameters");
    }

    const nextToken = event.queryStringParameters?.nextToken;
    const maxResults = parseInt(event.queryStringParameters?.maxResults || "20");

    let exclusiveStartKey = undefined;
    if (nextToken) {
      exclusiveStartKey = JSON.parse(Buffer.from(nextToken, "base64").toString("utf-8"));
    }

    const result = await ddbDocClient.send(
      new QueryCommand({
        TableName: TABLE_MOVIES,
        IndexName: "genre-index",
        KeyConditionExpression: "genreId = :genreId",
        ExpressionAttributeValues: {
          ":genreId": genreId,
        },
        Limit: maxResults,
        ExclusiveStartKey: exclusiveStartKey,
      })
    );

    let responseNextToken = undefined;
    if (result.LastEvaluatedKey) {
      responseNextToken = Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString("base64");
    }

    return formatResponse(200, {
      items: result.Items || [],
      nextToken: responseNextToken,
    });
  } catch (error) {
    return handleError(error);
  }
};
