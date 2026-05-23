import { ScanCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddbDocClient } from "../shared/dynamodb";
import { requireScope } from "../shared/auth";
import { handleError, formatResponse } from "../shared/errors";

const TABLE_MOVIES = process.env.TABLE_MOVIES;

export const handler = async (event: any) => {
  try {
    // Validate scope
    requireScope(event, "catalog:read");

    const queryParams = event.queryStringParameters || {};
    const genre = queryParams.genre;
    const director = queryParams.director;
    const year = queryParams.year ? parseInt(queryParams.year) : undefined;
    const q = queryParams.q;
    const nextToken = queryParams.nextToken;
    const maxResults = parseInt(queryParams.maxResults || "20");

    let exclusiveStartKey = undefined;
    if (nextToken) {
      exclusiveStartKey = JSON.parse(Buffer.from(nextToken, "base64").toString("utf-8"));
    }

    let result;
    if (genre) {
      result = await ddbDocClient.send(
        new QueryCommand({
          TableName: TABLE_MOVIES,
          IndexName: "genre-index",
          KeyConditionExpression: "genreId = :genreId",
          ExpressionAttributeValues: { ":genreId": genre },
          Limit: maxResults,
          ExclusiveStartKey: exclusiveStartKey,
        })
      );
    } else if (director) {
      result = await ddbDocClient.send(
        new QueryCommand({
          TableName: TABLE_MOVIES,
          IndexName: "director-index",
          KeyConditionExpression: "director = :director",
          ExpressionAttributeValues: { ":director": director },
          Limit: maxResults,
          ExclusiveStartKey: exclusiveStartKey,
        })
      );
    } else if (year) {
      result = await ddbDocClient.send(
        new QueryCommand({
          TableName: TABLE_MOVIES,
          IndexName: "year-index",
          KeyConditionExpression: "releaseYear = :releaseYear",
          ExpressionAttributeValues: { ":releaseYear": year },
          Limit: maxResults,
          ExclusiveStartKey: exclusiveStartKey,
        })
      );
    } else if (q) {
      result = await ddbDocClient.send(
        new ScanCommand({
          TableName: TABLE_MOVIES,
          FilterExpression: "contains(#title, :q)",
          ExpressionAttributeNames: { "#title": "title" },
          ExpressionAttributeValues: { ":q": q },
          Limit: maxResults,
          ExclusiveStartKey: exclusiveStartKey,
        })
      );
    } else {
      result = await ddbDocClient.send(
        new ScanCommand({
          TableName: TABLE_MOVIES,
          Limit: maxResults,
          ExclusiveStartKey: exclusiveStartKey,
        })
      );
    }

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
