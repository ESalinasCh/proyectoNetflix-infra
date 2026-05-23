import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddbDocClient } from "../shared/dynamodb";
import { requireScope, validateUserOrAdmin } from "../shared/auth";
import { handleError, formatResponse } from "../shared/errors";

const TABLE_USER_LISTS = process.env.TABLE_USER_LISTS;

export const handler = async (event: any) => {
  try {
    // Validate scope
    requireScope(event, "mylist:read");

    const userId = event.pathParameters?.userId;
    if (!userId) {
      throw new Error("Validation: Missing userId in path parameters");
    }

    // Enforce owner-only or admin check
    validateUserOrAdmin(event, userId);

    const result = await ddbDocClient.send(
      new QueryCommand({
        TableName: TABLE_USER_LISTS,
        KeyConditionExpression: "userId = :userId",
        ExpressionAttributeValues: {
          ":userId": userId,
        },
      })
    );

    return formatResponse(200, {
      items: result.Items || [],
    });
  } catch (error) {
    return handleError(error);
  }
};
