CREATE TABLE `ai_handoffs` (
	`code_hash` text PRIMARY KEY NOT NULL,
	`platform` text NOT NULL,
	`state` text NOT NULL,
	`profile_json` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
