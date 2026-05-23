import { handler } from "./getUserList";
import { ddbDocClient } from "../shared/dynamodb";
import { requireScope, validateUserOrAdmin } from "../shared/auth";

jest.mock("../shared/dynamodb", () => ({
  ddbDocClient: {
    send: jest.fn(),
  },
}));

jest.mock("../shared/auth", () => ({
  requireScope: jest.fn(),
  validateUserOrAdmin: jest.fn(),
}));

describe("getUserList lambda handler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("successfully gets user lists for authorized owner", async () => {
    const mockList = [
      { userId: "user-123", movieId: "movie-abc", addedAt: "2026-05-23T00:00:00Z" },
    ];

    (ddbDocClient.send as jest.Mock).mockResolvedValue({
      Items: mockList,
    });

    const event = {
      pathParameters: {
        userId: "user-123",
      },
    };

    const response = await handler(event);

    expect(requireScope).toHaveBeenCalledWith(event, "mylist:read");
    expect(validateUserOrAdmin).toHaveBeenCalledWith(event, "user-123");
    expect(ddbDocClient.send).toHaveBeenCalled();
    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body);
    expect(body.items).toEqual(mockList);
  });

  test("fails if userId path parameter is missing", async () => {
    const event = {
      pathParameters: {},
    };

    const response = await handler(event);

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.message).toContain("Validation: Missing userId");
  });

  test("fails if validateUserOrAdmin throws error", async () => {
    (validateUserOrAdmin as jest.Mock).mockImplementation(() => {
      throw new Error("Forbidden: You are not authorized to access this resource");
    });

    const event = {
      pathParameters: {
        userId: "user-123",
      },
    };

    const response = await handler(event);

    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body);
    expect(body.message).toContain("Forbidden");
  });
});
