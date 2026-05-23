import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddbDocClient } from "../shared/dynamodb";
import { requireScope, validateUserOrAdmin } from "../shared/auth";
import { handleError, formatResponse } from "../shared/errors";

const TABLE_WATCH_HISTORY = process.env.TABLE_WATCH_HISTORY;

export const handler = async (event: any) => {
  try {
    // Validate scope
    requireScope(event, "history:read");

    const userId = event.pathParameters?.userId;
    if (!userId) {
      throw new Error("Validation: Missing userId in path parameters");
    }

    // Enforce owner or admin authorization
    validateUserOrAdmin(event, userId);

    const queryParams = event.queryStringParameters || {};
    const completedStr = queryParams.completed;
    const nextToken = queryParams.nextToken;
    const maxResults = parseInt(queryParams.maxResults || "20");

    let exclusiveStartKey = undefined;
    if (nextToken) {
      exclusiveStartKey = JSON.parse(Buffer.from(nextToken, "base64").toString("utf-8"));
    }

    let filterExpression = undefined;
    let expressionAttributeValues: any = {
      ":userId": userId,
    };

    if (completedStr !== undefined) {
      const completedVal = completedStr === "true";
      filterExpression = "completed = :completed";
      expressionAttributeValues[":completed"] = completedVal;
    }

    const result = await ddbDocClient.send(
      new QueryCommand({
        TableName: TABLE_WATCH_HISTORY,
        IndexName: "recent-index",
        KeyConditionExpression: "userId = :userId",
        FilterExpression: filterExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        ScanIndexForward: false, // Descending order (newest first)
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
