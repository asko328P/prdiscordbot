module.exports = {
    onlineClanMatesThreshold: 4, //how many clanmates should be online so that it makes an alert
    onlinePlayersThreshold: 10, //minimum amount of online players in a server so that it shows in the "servers" message reply
    apiAccessDelayMinutes: 3, //how much to wait to do another api call, default 5 minutes
    onlineClanMatesAlertTime: 60 * 60 * 4, //how much do wait to make another alert if more than onlineClanMatesThreshold are online, default: 4 hours
};
