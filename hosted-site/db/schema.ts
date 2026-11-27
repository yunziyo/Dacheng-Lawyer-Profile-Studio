import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Temporary résumé handoff only. No source files, accounts, or durable drafts
// are stored here. Rows expire after 15 minutes and are deleted on redemption.
export const aiHandoffs = sqliteTable("ai_handoffs", {
  codeHash: text("code_hash").primaryKey(),
  platform: text("platform").notNull(),
  state: text("state").notNull(),
  profileJson: text("profile_json"),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

export const lawyerSites = sqliteTable("lawyer_sites", {
  slug: text("slug").primaryKey(),
  manageHash: text("manage_hash").notNull().unique(),
  contentJson: text("content_json").notNull(),
  active: integer("active").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
