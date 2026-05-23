import { handler } from "./listGenres";
import { ddbDocClient } from "../shared/dynamodb";
import { requireScope } from "../shared/auth";

jest.mock("../shared/dynamodb", () => ({
  ddbDocClient: {
    send: jest.fn(),
  },
}));

jest.mock("../shared/auth", () => ({
  requireScope: jest.fn(),
}));

describe("listGenres lambda handler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("successfully lists genres", async () => {
    const mockGenres = [
      { genreId: "action", name: "Action" },
      { genreId: "comedy", name: "Comedy" },
    ];

    (ddbDocClient.send as jest.Mock).mockResolvedValue({
      Items: mockGenres,
    });

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

    const response = await handler(event);

    expect(requireScope).toHaveBeenCalledWith(event, "catalog:read");
    expect(ddbDocClient.send).toHaveBeenCalled();
    expect(response.statusCode).toBe(200);
    
    const body = JSON.parse(response.body);
    expect(body.items).toEqual(mockGenres);
  });

  test("returns error response if scope check fails", async () => {
    (requireScope as jest.Mock).mockImplementation(() => {
      throw new Error("Forbidden: Missing required scope: catalog:read");
    });

    const event = {};
    const response = await handler(event);

    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body);
    expect(body.message).toContain("Forbidden");
  });
});
