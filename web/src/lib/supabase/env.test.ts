import { describe, expect, it } from "vitest";

import { normalizeUrl } from "@/lib/supabase/env";

describe("normalizeUrl", () => {
  it("leaves a bare project URL unchanged", () => {
    expect(normalizeUrl("https://wpzochrmzhecqyntegbp.supabase.co")).toBe(
      "https://wpzochrmzhecqyntegbp.supabase.co"
    );
  });

  it("strips a trailing slash", () => {
    expect(normalizeUrl("https://wpzochrmzhecqyntegbp.supabase.co/")).toBe(
      "https://wpzochrmzhecqyntegbp.supabase.co"
    );
  });

  it("strips a /rest/v1 suffix copied from the API docs page", () => {
    expect(normalizeUrl("https://wpzochrmzhecqyntegbp.supabase.co/rest/v1")).toBe(
      "https://wpzochrmzhecqyntegbp.supabase.co"
    );
  });

  it("strips /rest/v1/ with a trailing slash too", () => {
    expect(normalizeUrl("https://wpzochrmzhecqyntegbp.supabase.co/rest/v1/")).toBe(
      "https://wpzochrmzhecqyntegbp.supabase.co"
    );
  });

  it("trims surrounding whitespace from a pasted value", () => {
    expect(normalizeUrl("  https://wpzochrmzhecqyntegbp.supabase.co  ")).toBe(
      "https://wpzochrmzhecqyntegbp.supabase.co"
    );
  });
});
