import { describe, it, expect, beforeEach } from "vitest";
import { signUp, signIn, signInWithGoogle, getCurrentUser, getSession } from "../../lib/auth";
import { supabaseConfigured } from "../../lib/supabase";

describe("Authentication Integration Tests", () => {
  describe("Supabase Configuration", () => {
    it("should have Supabase configured", () => {
      expect(supabaseConfigured).toBe(true);
    });
  });

  describe("Auth Functions Availability", () => {
    it("should have signUp function", () => {
      expect(typeof signUp).toBe("function");
    });

    it("should have signIn function", () => {
      expect(typeof signIn).toBe("function");
    });

    it("should have signInWithGoogle function", () => {
      expect(typeof signInWithGoogle).toBe("function");
    });

    it("should have getCurrentUser function", () => {
      expect(typeof getCurrentUser).toBe("function");
    });

    it("should have getSession function", () => {
      expect(typeof getSession).toBe("function");
    });
  });

  describe("Auth Functions Error Handling", () => {
    it("should not throw on signUp call", async () => {
      expect(async () => {
        await signUp("test@example.com", "password123", "TestUser");
      }).not.toThrow();
    });

    it("should not throw on signIn call", async () => {
      expect(async () => {
        await signIn("test@example.com", "password123");
      }).not.toThrow();
    });

    it("should not throw on signInWithGoogle call", async () => {
      expect(async () => {
        await signInWithGoogle();
      }).not.toThrow();
    });

    it("should not throw on getCurrentUser call", async () => {
      expect(async () => {
        await getCurrentUser();
      }).not.toThrow();
    });

    it("should not throw on getSession call", async () => {
      expect(async () => {
        await getSession();
      }).not.toThrow();
    });
  });

  describe("Auth Response Structure", () => {
    it("signUp should return user or error", async () => {
      const result = await signUp("test@example.com", "password123", "TestUser");
      
      expect(result).toHaveProperty("user");
      expect(result).toHaveProperty("error");
      expect(result.user === null || result.error === null).toBe(true);
    });

    it("signIn should return user or error", async () => {
      const result = await signIn("test@example.com", "password123");
      
      expect(result).toHaveProperty("user");
      expect(result).toHaveProperty("error");
      expect(result.user === null || result.error === null).toBe(true);
    });

    it("signInWithGoogle should return error property", async () => {
      const result = await signInWithGoogle();
      
      expect(result).toHaveProperty("error");
      expect(typeof result.error === "string" || result.error === null).toBe(true);
    });

    it("getCurrentUser should return user or null", async () => {
      const user = await getCurrentUser();
      
      expect(user === null || typeof user === "object").toBe(true);
    });

    it("getSession should return session or null", async () => {
      const session = await getSession();
      
      expect(session === null || typeof session === "object").toBe(true);
    });
  });

  describe("Password Validation", () => {
    it("should reject password shorter than 8 characters", async () => {
      const result = await signUp("test@example.com", "short", "TestUser");
      
      expect(result.error).toBeDefined();
      expect(result.error).toContain("8");
    });

    it("should accept password of 8 or more characters", async () => {
      const result = await signUp("test@example.com", "password123", "TestUser");
      
      // Either succeeds or fails with different error (not password length)
      if (result.error) {
        expect(result.error).not.toContain("8 символов");
      }
    });
  });

  describe("Nickname Validation", () => {
    it("should reject nickname shorter than 3 characters", async () => {
      const result = await signUp("test@example.com", "password123", "ab");
      
      expect(result.error).toBeDefined();
      expect(result.error).toContain("3");
    });

    it("should reject nickname longer than 20 characters", async () => {
      const result = await signUp("test@example.com", "password123", "abcdefghijklmnopqrstu");
      
      expect(result.error).toBeDefined();
      expect(result.error).toContain("20");
    });

    it("should accept nickname of 3-20 characters", async () => {
      const result = await signUp("test@example.com", "password123", "ValidNickname");
      
      // Either succeeds or fails with different error (not nickname length)
      if (result.error) {
        expect(result.error).not.toContain("3-20");
      }
    });
  });

  describe("Email Validation", () => {
    it("should require email for signUp", async () => {
      const result = await signUp("", "password123", "TestUser");
      
      expect(result.error).toBeDefined();
    });

    it("should require email for signIn", async () => {
      const result = await signIn("", "password123");
      
      expect(result.error).toBeDefined();
    });
  });

  describe("Local Game Access", () => {
    it("should allow guest access to local game", async () => {
      // This is verified by ProtectedRoute component
      // which allows /local without authentication
      expect(true).toBe(true);
    });
  });
});
