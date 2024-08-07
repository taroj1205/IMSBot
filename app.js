require("dotenv").config();
const { Client, GatewayIntentBits, REST, Routes } = require("discord.js");
const mysql = require("mysql2/promise");
const { botStatus } = require("./src/bot/botStatus");

const { process_moderationapi_message } = require("./src/bot/moderationApi");
const {
	verify_command,
	verify_interaction,
} = require("./src/bot/commands/verify");
const {
	sync_roles_command,
	sync_roles_interaction,
} = require("./src/bot/commands/sync_roles");
const { automod_channel, general_channel } = require("./src/bot/constants");
const {
	blacklist_command,
	blacklist_interaction,
} = require("./src/bot/commands/blacklist");
const {
	get_uuid_command,
	get_uuid_interaction,
} = require("./src/bot/commands/get_uuid");
const {
	punishments_command,
	punishments_interaction,
} = require("./src/bot/commands/punishments");
const {
	guild_apply_command,
	guild_apply_interaction,
} = require("./src/bot/commands/guild_apply");

// Create a new client instance
const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent,
		GatewayIntentBits.DirectMessages,
	],
});

// Database connection
const db = mysql.createPool({
	host: process.env.DB_HOST,
	user: process.env.DB_USER,
	password: process.env.DB_PASSWORD,
	database: process.env.DB_NAME,
});

// When the client is ready, run this code
client.once("ready", () => {
	console.log(`Logged in as ${client.user.tag}!`);
	botStatus.isRunning = true; // Set bot status to running
	registerSlashCommands();
});

// Slash command registration
async function registerSlashCommands() {
	const commands = [
		verify_command,
		sync_roles_command,
		blacklist_command,
		get_uuid_command,
		punishments_command,
		guild_apply_command,
	].map((command) => command.toJSON());

	const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

	try {
		console.log("Started refreshing application (/) commands.");

		await rest.put(Routes.applicationCommands(client.user.id), {
			body: commands,
		});

		console.log("Successfully reloaded application (/) commands.");
	} catch (error) {
		console.error("Error reloading application (/) commands:", error);
	}
}

client.on("interactionCreate", async (interaction) => {
	if (!interaction.isChatInputCommand()) return;

	const { commandName } = interaction;

	if (commandName === "verify") {
		await verify_interaction(interaction, db);
	} else if (commandName === "sync-roles") {
		await sync_roles_interaction(interaction, db);
	} else if (commandName === "blacklist") {
		await blacklist_interaction(interaction, db);
	} else if (commandName === "get_uuid") {
		await get_uuid_interaction(interaction, db);
	} else if (commandName === "punishments") {
		await punishments_interaction(interaction, db);
	} else if (commandName === "guild_apply") {
		await guild_apply_interaction(interaction, db);
	}
});

// When a message is created
client.on("messageCreate", async (message) => {
	const channel = await client.channels.fetch(automod_channel);

	// Ignore messages from bots
	if (message.author.bot) return;

	if (message.content === "!status") {
		channel.send(`Bot status: ${JSON.stringify(botStatus)}`);
		return;
	}

	// Message logging in RDS
	try {
		// Add messages in #general to normal_messages
		if (message.channel.id === general_channel) {
			await db.query(
				"INSERT INTO normal_messages (senderid, message, time_stamp) VALUES (?, ?, ?)",
				[
					message.author.id,
					message.content,
					new Date(message.createdTimestamp).toLocaleString() + " CDT",
				],
			);
		}

		botStatus.rdsWorking = true;
	} catch (error) {
		console.error("Error adding message to RDS:", error);
		botStatus.rdsWorking = false;
	}

	// Automod messages using OpenAI Moderation API
	try {
		await process_moderationapi_message(
			message,
			"https://api.openai.com/v1/moderations",
			channel,
			client,
		);
		botStatus.apiWorking = true;
	} catch (error) {
		console.error("Error processing message:", error);
		botStatus.apiWorking = false;
	}
});

// Login to Discord with your app's token
client.login(process.env.DISCORD_TOKEN).catch((error) => {
	console.error("Error logging in to Discord:", error);
	botStatus.isRunning = false; // Set bot status to not running if login fails
});
