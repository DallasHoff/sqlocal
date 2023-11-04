CREATE TABLE `cities` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text,
	`country_id` integer,
	FOREIGN KEY (`country_id`) REFERENCES `countries`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `countries` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `nameIdx` ON `countries` (`name`);