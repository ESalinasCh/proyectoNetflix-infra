import { getAuthContext, requireScope, requireRole, validateUserOrAdmin } from "./auth";

describe("Authentication Utilities", () => {
  test("getAuthContext with requestContext claims", () => {
    const event = {
      requestContext: {
        authorizer: {
          claims: {
            sub: "user-123",
            scope: "catalog:read catalog:write",
            roles: ["admin"],
          },
        },
      },
    };

    const context = getAuthContext(event);
    expect(context.userId).toBe("user-123");
    expect(context.scopes).toEqual(["catalog:read", "catalog:write"]);
    expect(context.roles).toEqual(["admin"]);
  });

  test("getAuthContext with JWT token in headers", () => {
    // Mock JWT payload: { sub: "user-456", scope: "streaming:read", roles: "premium_user" }
    // Header format: Bearer header.payload.signature
    const payload = Buffer.from(
      JSON.stringify({
        sub: "user-456",
        scope: "streaming:read",
        roles: "premium_user",
      })
    )
      .toString("base64")
      .replace(/=/g, "");

    const token = `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${payload}.signature`;

    const event = {
      headers: {
        Authorization: token,
      },
    };

    const context = getAuthContext(event);
    expect(context.userId).toBe("user-456");
    expect(context.scopes).toEqual(["streaming:read"]);
    expect(context.roles).toEqual(["premium_user"]);
  });

  test("requireScope allows matched scope", () => {
    const event = {
      requestContext: {
        authorizer: {
          claims: {
            sub: "user-123",
            scope: "catalog:read",
            roles: [],
          },
        },
      },
    };

    expect(() => requireScope(event, "catalog:read")).not.toThrow();
    expect(() => requireScope(event, "catalog:write")).toThrow(
      "Forbidden: Missing required scope: catalog:write"
    );
  });

  test("requireScope allows super_admin regardless of scope", () => {
    const event = {
      requestContext: {
        authorizer: {
          claims: {
            sub: "user-123",
            scope: "",
            roles: ["super_admin"],
          },
        },
      },
    };

    expect(() => requireScope(event, "catalog:read")).not.toThrow();
  });

  test("requireRole allows allowed roles", () => {
    const event = {
      requestContext: {
        authorizer: {
          claims: {
            sub: "user-123",
            roles: ["editor"],
          },
        },
      },
    };

    expect(() => requireRole(event, ["editor", "admin"])).not.toThrow();
    expect(() => requireRole(event, ["admin"])).toThrow(
      "Forbidden: Access denied. Allowed roles: admin"
    );
  });

  test("validateUserOrAdmin checks owner identity or admin role", () => {
    const event = {
      requestContext: {
        authorizer: {
          claims: {
            sub: "user-123",
            roles: ["user"],
          },
        },
      },
    };

    expect(() => validateUserOrAdmin(event, "user-123")).not.toThrow();
    expect(() => validateUserOrAdmin(event, "user-456")).toThrow(
      "Forbidden: You are not authorized to access this resource"
    );

    const adminEvent = {
      requestContext: {
        authorizer: {
          claims: {
            sub: "admin-1",
            roles: ["super_admin"],
          },
        },
      },
    };
    expect(() => validateUserOrAdmin(adminEvent, "user-456")).not.toThrow();
  });
});
