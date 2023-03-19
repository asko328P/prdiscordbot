require("dotenv").config();
const config = require("./configuration/botConfig");
const axios = require("axios");
const {Client, GatewayIntentBits} = require("discord.js");
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});
const Enmap = require("enmap");
const serverEnmap = new Enmap({name: "servers"});
const os = require("os");
const repl = require("repl");

const returnServers = async () => {
    console.log("retreiving current servers")
    const request = await axios.get("https://servers.realitymod.com/api/ServerInfo");
    return request.data.servers;
};

const getClanPlayers = clanTag => {
    console.log("searching for clantag: " + clanTag);

    let clanPlayers = [];
    const servers = serverEnmap.get("servers");
    servers.forEach(server => {
        if (server.properties.numplayers != "0") {
            server.players.forEach(player => {
                if (player.name.includes(clanTag)) {
                    clanPlayers.push({name: player.name, server: server.properties.hostname.slice(server.properties.hostname.indexOf("]") + 1)});
                }
            });
        }
    });
    return clanPlayers;
};

const writeOnlinePlayersMessage = clanTag => {
    console.log("writing for clantag: " + clanTag);

    let replyMessage = "```The following players are online:";

    const servers = serverEnmap.get("servers");
    servers.forEach(server => {
        if (server.properties.numplayers != "0") {
            let serverNameListed=false
            server.players.forEach(player => {
                if (player.name.includes(clanTag)) {
                    if(serverNameListed==false){
                        replyMessage+="\n"+server.properties.hostname.slice(server.properties.hostname.indexOf("]") + 1)
                        replyMessage+=", map: " + server.properties.mapname +", "+ server.properties.numplayers + "/" + server.properties.maxplayers;
                        serverNameListed=true
                    }
                    replyMessage+="\n     "+player.name
                }
            });
        }
    });

    replyMessage = replyMessage.substring(0, 1900);
    replyMessage += "```";

    return replyMessage;
};

const writeServersMessage = servers => {
    servers.sort(function (a, b) {
        return b.properties.numplayers - a.properties.numplayers;
    });
    let replyMessage = "```";
    servers.forEach(server => {
        if (server.properties.numplayers > config.onlinePlayersThreshold) {
            replyMessage = replyMessage + server.properties.hostname.slice(server.properties.hostname.indexOf("]") + 1) + "\n " + server.properties.numplayers + "/" + server.properties.maxplayers;
            replyMessage += ", map: " + server.properties.mapname + "\n\n";
        }
    });
    replyMessage = replyMessage.substring(0, 1900);
    replyMessage += "```";
    return replyMessage;
};

const getClanTagFromServerId = serverId => {
    if (serverEnmap.has("serverProperties") == false) {
        return "noServerProperties";
    } else {
        let allServersProperties = serverEnmap.get("serverProperties");
        let specificProperties = allServersProperties[allServersProperties.findIndex(item => item.serverId == serverId)];
        return specificProperties.clanTag;
    }
};

console.log(serverEnmap.get("serverProperties"));

client.on("ready", async () => {
    console.log(`Logged in as ${client.user.tag}!`);

    try {
        if (serverEnmap.has("servers") == false) {
            await returnServers().then(servers => {
                serverEnmap.set("servers", servers);
            });
        }
    } catch (err) {
        console.log(err);
    }

    setInterval(async () => {
        try {
            await returnServers().then(servers => {
                serverEnmap.set("servers", servers);
            });

            if (serverEnmap.has("servers") && serverEnmap.has("serverProperties")) {
                let allServerProperties = serverEnmap.get("serverProperties");
                allServerProperties.forEach(serverProperties => {
                    if (os.uptime() - serverProperties.onlineClanMatesAlertTime > 0) {
                        if (getClanPlayers(serverProperties.clanTag).length > serverProperties.onlineClanMatesThreshold) {
                            console.log("There are more online players than the threshold for: " + serverProperties.serverId);
                            serverProperties.onlineClanMatesAlertTime = os.uptime() + config.onlineClanMatesAlertTime;
                            client.channels.cache.get(serverProperties.channelId).send(writeOnlinePlayersMessage(serverProperties.clanTag));
                        } else {
                            console.log("There are less online players than the threshold for; " + serverProperties.serverId);
                            serverProperties.onlineClanMatesAlertTime = os.uptime();
                        }
                    }
                });
                serverEnmap.set("serverProperties", allServerProperties);
            }
        } catch (err) {
            console.log(err);
        }
    }, 1000 * 60 * config.apiAccessDelayMinutes); //refreshes every X minutes. PRSPY api allows for 2 accesses per minute.
});

client.on("messageCreate", async message => {
    try {
        switch (message.content.toLowerCase()) {
            case "servers":
                const servers = serverEnmap.get("servers");
                message.reply(writeServersMessage(servers));
                break;

            case "clan":
                let clanTag = getClanTagFromServerId(message.guildId) + " ";
                message.reply(writeOnlinePlayersMessage(clanTag));
                break;

            case "prbotsetchannel":
                message.reply("Setting default channel");
                console.log("setting default channel");
                if (serverEnmap.has("serverProperties") == false) {
                    let serverProperties = [];
                    serverProperties.push({
                        serverId: message.guildId,
                        channelId: message.channelId,
                        clanTag: config.defaultClanTag,
                        onlineClanMatesThreshold: config.onlineClanMatesThreshold,
                        onlineClanMatesAlertTime: 0,
                    });
                    serverEnmap.set("serverProperties", serverProperties);
                } else {
                    if (serverEnmap.get("serverProperties").findIndex(item => item.serverId == message.guildId) == "-1") {
                        serverEnmap.push("serverProperties", {
                            serverId: message.guildId,
                            channelId: message.channelId,
                            clanTag: config.defaultClanTag,
                            onlineClanMatesThreshold: config.onlineClanMatesThreshold,
                            onlineClanMatesAlertTime: 0,
                        });
                    } else {
                        let allServersProperties = serverEnmap.get("serverProperties");
                        allServersProperties[allServersProperties.findIndex(item => item.serverId == message.guildId)].channelId = message.channelId;
                        serverEnmap.set("serverProperties", allServersProperties);
                    }
                }
                break;

            default:
                break;
        }

        if (message.content.toLowerCase().split(" ")[0] == "prbotsetclantag") {
            message.reply("Setting clantag");
            console.log("setting clantag for: ", message.guildId);
            if (serverEnmap.has("serverProperties") == false) {
                let serverProperties = [];
                serverProperties.push({
                    serverId: message.guildId,
                    channelId: message.channelId,
                    clanTag: message.content.split(" ")[1],
                    onlineClanMatesThreshold: config.onlineClanMatesThreshold,
                    onlineClanMatesAlertTime: 0,
                });
                serverEnmap.set("serverProperties", serverProperties);
            } else {
                if (serverEnmap.get("serverProperties").findIndex(item => item.serverId == message.guildId) == "-1") {
                    serverEnmap.push("serverProperties", {
                        serverId: message.guildId,
                        channelId: message.channelId,
                        clanTag: message.content.split(" ")[1],
                        onlineClanMatesThreshold: config.onlineClanMatesThreshold,
                        onlineClanMatesAlertTime: 0,
                    });
                } else {
                    let allServersProperties = serverEnmap.get("serverProperties");
                    allServersProperties[allServersProperties.findIndex(item => item.serverId == message.guildId)].clanTag = message.content.split(" ")[1];
                    allServersProperties[allServersProperties.findIndex(item => item.serverId == message.guildId)].onlineClanMatesAlertTime = os.uptime();
                    serverEnmap.set("serverProperties", allServersProperties);
                }
            }
        }

        if (message.content.toLowerCase().split(" ")[0] == "prbotsetonlineclanmates") {
            message.reply("Setting online clanmates threshold");
            console.log("setting clanmates threshold for: ", message.guildId);
            if (serverEnmap.has("serverProperties") == false) {
                let serverProperties = [];
                serverProperties.push({
                    serverId: message.guildId,
                    channelId: message.channelId,
                    clanTag: config.defaultClanTag,
                    onlineClanMatesThreshold: message.content.split(" ")[1],
                    onlineClanMatesAlertTime: 0,
                });
                serverEnmap.set("serverProperties", serverProperties);
            } else {
                if (serverEnmap.get("serverProperties").findIndex(item => item.serverId == message.guildId) == "-1") {
                    serverEnmap.push("serverProperties", {
                        serverId: message.guildId,
                        channelId: message.channelId,
                        clanTag: config.defaultClanTag,
                        onlineClanMatesThreshold: message.content.split(" ")[1],
                        onlineClanMatesAlertTime: 0,
                    });
                } else {
                    let allServersProperties = serverEnmap.get("serverProperties");
                    allServersProperties[allServersProperties.findIndex(item => item.serverId == message.guildId)].onlineClanMatesThreshold = message.content.split(" ")[1];
                    serverEnmap.set("serverProperties", allServersProperties);
                }
            }
        }
    } catch (err) {
        console.log(err);
    }
});

client.login(process.env.BOT_TOKEN);
