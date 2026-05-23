export interface ErrorResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "OPTIONS,GET,POST,PUT,DELETE",
};

export function handleError(error: any): ErrorResponse {
  console.error("Error handled in Lambda execution:", error);

  let statusCode = 500;
  let body: any = {
    message: error.message || "Internal Server Error",
  };

  const errorMessage = error.message || "";

  if (errorMessage.includes("Unauthorized")) {
    statusCode = 401;
  } else if (errorMessage.includes("Forbidden") || errorMessage.includes("Access denied")) {
    statusCode = 403;
    if (errorMessage.includes("required scope:")) {
      body.requiredScope = errorMessage.split("required scope:")[1].trim();
    }
  } else if (
    errorMessage.includes("Validation") || 
    error.name === "ValidationError" || 
    errorMessage.includes("missing") || 
    errorMessage.includes("invalid")
  ) {
    statusCode = 400;
    if (error.fieldErrors) {
      body.fieldErrors = error.fieldErrors;
    }
  } else if (
    errorMessage.includes("not found") || 
    error.name === "NotFoundError" || 
    errorMessage.includes("NotFound")
  ) {
    statusCode = 404;
    body.resourceType = error.resourceType || "Resource";
    body.resourceId = error.resourceId || "";
  } else if (
    errorMessage.includes("already exists") || 
    error.name === "ConflictError" || 
    errorMessage.includes("Conflict")
  ) {
    statusCode = 409;
  }

  return {
    statusCode,
    headers,
    body: JSON.stringify(body),
  };
}

export function formatResponse(statusCode: number, data?: any): any {
  return {
    statusCode,
    headers,
    body: data ? JSON.stringify(data) : "",
  };
}
