// Backward-compatibility re-exports. The community registry now lives in
// Postgres — see `lib/db/schema.ts` for the schema and `lib/db/queries.ts`
// for the read API. Existing imports `from "@/data/communities"` keep
// working, but new code should import directly from `@/lib/db/queries`.

export type {
  Community,
  CommunitySender,
} from "@/lib/db/queries";

export type {
  Address,
  CommunityBrand,
  CommunitySocials,
  CommunityHubSpot,
  CommunityLogo,
  CommunityAsset,
  CommunityVoice,
  CommunityMarketingDirector,
  BrandGuideExtracted,
} from "@/lib/db/schema";

export { getCommunity, listCommunities } from "@/lib/db/queries";

/**
 * @deprecated The hardcoded `communities` array no longer exists.
 *   Use `listCommunities()` (async) for the registry. Source-of-truth seed
 *   data lives in `lib/db/seed-data.ts` and is loaded into Postgres via
 *   `npm run db:seed`.
 */
export const communities: never[] = [];

/** @deprecated `CommunityType` is now an enum in the DB schema. */
export type CommunityType =
  | "assisted_living"
  | "memory_care"
  | "independent_living"
  | "mixed";
