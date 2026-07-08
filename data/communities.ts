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
  CommunityMarketingDirector,
  BrandGuideExtracted,
} from "@/lib/db/schema";

export { getCommunity, listCommunities } from "@/lib/db/queries";
