import { defineConfig } from 'vitepress';

// https://vitepress.dev/reference/site-config
export default defineConfig({
	title: 'SQLocal',
	description:
		'SQLocal makes it easy to run SQLite3 in the browser, backed by the origin private file system.',
	cleanUrls: true,
	themeConfig: {
		search: { provider: 'local' },
		nav: [
			{ text: 'Introduction', link: '/guide/introduction' },
			{ text: 'Setup', link: '/guide/setup' },
		],
		sidebar: [
			{
				text: 'Getting Started',
				items: [
					{ text: 'Introduction', link: '/guide/introduction' },
					{ text: 'Setup', link: '/guide/setup' },
				],
			},
			{
				text: 'Methods',
				items: [
					{
						text: 'sql',
						link: '/api/sql',
					},
					{
						text: 'transaction',
						link: '/api/transaction',
					},
					{
						text: 'createCallbackFunction',
						link: '/api/createcallbackfunction',
					},
					{
						text: 'getDatabaseFile',
						link: '/api/getdatabasefile',
					},
					{
						text: 'overwriteDatabaseFile',
						link: '/api/overwritedatabasefile',
					},
					{
						text: 'destroy',
						link: '/api/destroy',
					},
				],
			},
			{
				text: 'Kysely Query Builder',
				items: [
					{ text: 'Kysely Setup', link: '/kysely/setup' },
					{ text: 'Kysely Migrations', link: '/kysely/migrations' },
				],
			},
			{
				text: 'Drizzle ORM',
				items: [{ text: 'Drizzle Setup', link: '/drizzle/setup' }],
			},
		],
		socialLinks: [
			{
				icon: 'github',
				link: 'https://github.com/DallasHoff/sqlocal',
				ariaLabel: 'GitHub',
			},
			{
				icon: {
					svg: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><path fill="currentColor" d="M0 0v16h16V0H0zm13 13h-2V5H8v8H3V3h10v10z"/></svg>',
				},
				link: 'https://www.npmjs.com/package/sqlocal',
				ariaLabel: 'NPM',
			},
		],
		footer: {
			message: 'Released under the MIT License',
			copyright: 'Copyright © 2023-present Dallas Hoffman',
		},
	},
});
