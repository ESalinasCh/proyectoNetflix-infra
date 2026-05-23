import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { ddbDocClient } from "../shared/dynamodb";
import { requireScope, validateUserOrAdmin } from "../shared/auth";
import { handleError, formatResponse } from "../shared/errors";

const TABLE_STREAM_SESSIONS = process.env.TABLE_STREAM_SESSIONS;

export const handler = async (event: any) => {
  try {
    // Validate scope
    requireScope(event, "catalog:read");

    const sessionId = event.pathParameters?.sessionId;
    if (!sessionId) {
      throw new Error("Validation: Missing sessionId in path parameters");
    }

    const result = await ddbDocClient.send(
      new GetCommand({
        TableName: TABLE_STREAM_SESSIONS,
        Key: { sessionId },
      })
    );

    if (!result.Item) {
      const error: any = new Error(`NotFound: Streaming session with ID '${sessionId}' not found`);
      error.resourceType = "StreamSession";
      error.resourceId = sessionId;
      throw error;
    }

    // Validate owner or admin access
    validateUserOrAdmin(event, result.Item.userId);

    return formatResponse(200, {
      session: result.Item,
    });
  } catch (error) {
    return handleError(error);
  }
};
