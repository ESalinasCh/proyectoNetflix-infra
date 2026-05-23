export interface AuthContext {
  userId: string;
  scopes: string[];
  roles: string[];
}

// Helper to decode a JWT without verifying (useful for local development/testing)
function decodeJwt(token: string): any {
  try {
    const parts = token.replace("Bearer ", "").trim().split(".");
    if (parts.length !== 3) return null;
    const payload = Buffer.from(parts[1], "base64").toString("utf-8");
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

export function getAuthContext(event: any): AuthContext {
  const authorizer = event.requestContext?.authorizer;
  const claims = authorizer?.claims || authorizer;

  if (claims && (claims.sub || claims.principalId)) {
    const scopeString = claims.scope || "";
    const scopes = scopeString.split(" ").filter((s: string) => s.length > 0);
    const roles = claims["https://netflix-clone.com/roles"] || claims.roles || [];
    return {
      userId: claims.sub || claims.principalId,
      scopes,
      roles: Array.isArray(roles) ? roles : [roles],
    };
  }

  // Fallback for local testing using Authorization header
  const authHeader = event.headers?.Authorization || event.headers?.authorization;
  if (authHeader) {
    const decoded = decodeJwt(authHeader);
    if (decoded) {
      const scopeString = decoded.scope || "";
      const scopes = scopeString.split(" ").filter((s: string) => s.length > 0);
      const roles = decoded["https://netflix-clone.com/roles"] || decoded.roles || [];
      return {
        userId: decoded.sub || "mock-user",
        scopes,
        roles: Array.isArray(roles) ? roles : [roles],
      };
    }
  }

  throw new Error("Unauthorized: Authentication token is missing or invalid");
}

export function validateUserOrAdmin(event: any, targetUserId: string): void {
  const auth = getAuthContext(event);
  const isOwner = auth.userId === targetUserId;
  const isAdmin = auth.roles.includes("super_admin");

  if (!isOwner && !isAdmin) {
    throw new Error("Forbidden: You are not authorized to access this resource");
  }
}

export function requireScope(event: any, requiredScope: string): void {
  const auth = getAuthContext(event);
  if (!auth.scopes.includes(requiredScope) && !auth.roles.includes("super_admin")) {
    throw new Error(`Forbidden: Missing required scope: ${requiredScope}`);
  }
}

export function requireRole(event: any, allowedRoles: string[]): void {
  const auth = getAuthContext(event);
  const hasRole = auth.roles.some((role: string) => allowedRoles.includes(role));
  if (!hasRole && !auth.roles.includes("super_admin")) {
    throw new Error(`Forbidden: Access denied. Allowed roles: ${allowedRoles.join(", ")}`);
  }
}
