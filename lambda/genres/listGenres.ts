import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { ddbDocClient } from "../shared/dynamodb";
import { requireScope } from "../shared/auth";
import { handleError, formatResponse } from "../shared/errors";

const TABLE_GENRES = process.env.TABLE_GENRES;

export const handler = async (event: any) => {
  try {
    // Validate scopes
    requireScope(event, "catalog:read");

    const result = await ddbDocClient.send(
      new ScanCommand({
        TableName: TABLE_GENRES,
      })
    );

    return formatResponse(200, {
      items: result.Items || [],
    });
  } catch (error) {
    return handleError(error);
  }
};
