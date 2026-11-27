CREATE TABLE `lawyer_sites` (
	`slug` text PRIMARY KEY NOT NULL,
	`manage_hash` text NOT NULL,
	`content_json` text NOT NULL,
	`active` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lawyer_sites_manage_hash_unique` ON `lawyer_sites` (`manage_hash`);