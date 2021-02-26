//requires
const axios = require('axios');
const fs = require('fs');

//get app credentials from file
const {client_id, secret} = require('./auth.json');

//set required cmd line args
let argv = require('yargs/yargs')(process.argv.slice(2))
    .usage('Usage: $0 --guildID [numeric guild id] --guildTagID [numeric tag ID] --startTime [unix timestamp] --webhook [url]')
    .demandOption(['guildID','guildTagID', 'startTime', 'webhook'])
    .argv;

//init vars
let bearerToken;
let fileName = './processedReports';
let logTimestamp = new Date();

//touch processed file
fs.closeSync(fs.openSync(fileName, 'a'));

//get bearer token
const getToken = () => {
    try {
        return axios.post('https://www.warcraftlogs.com/oauth/token', {
                grant_type: 'client_credentials'
            },
            {
                auth: {
                    password: secret,
                    username: client_id
                }
            })
    } catch (error) {
        console.error(logTimestamp.toLocaleString(), error.message);
    }
};

//set bearer token to var
const setToken = async () => {
    await getToken()
        .then(response => {
            bearerToken = response.data.access_token;
        })
        .catch(error => {
            console.error(logTimestamp.toLocaleString(), error.message)
        });
};

//continue to fetch reports after setting token
setToken().then(function () {
    fetchList();
});

//fetch reports
async function fetchList () {
    await axios({
        url: "https://www.warcraftlogs.com/api/v2/client",
        method: 'post',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${bearerToken}`
        },
        data: {
            query: `query {
                    reportData {
                        reports (
                            limit: 5
                            guildID: ${argv.guildID}
                            guildTagID: ${argv.guildTagID}
                            startTime: ${argv.startTime}
                        ) {
                            data {
                                code
                                guildTag {
                                    name
                                    id
                                }
                                startTime
                                endTime
                                title
                                zone {
                                    name
                                }
                                owner {
                                    name
                                }
                            }
                        }
                    }
                    }
                `
            }
    }).then(response => {
        let results = response.data.data.reportData.reports;
        //iterate through results
        for (let report in results.data) postToDiscord(results.data[report]);
    }).catch(error => {
        console.error(logTimestamp.toLocaleString(), error.message);
    })


}

//send notification to Discord webhook
function postToDiscord (reportData) {
    //format timestamp to make Discord happy
    let timestamp = new Date(reportData.startTime);

    //check the report code and see if we've already sent this one
    fs.readFile(fileName, function (err, data) {
        if (err) throw err;
        if(data.includes(reportData.code)){
            //exit function if exists
            console.log(reportData.code, " already sent!");
            return false;
        }
        else if (!reportData.zone) {
            console.log(reportData.code, " is missing zone information, not sent!");
            return false;
        }
        else {
            //post to Discord
            console.log(JSON.stringify(reportData));
            axios.post(argv.webhook,{
                "content": "New WCL upload",
                "embeds": [
                    {
                        "title": reportData.title,
                        "description": reportData.guildTag.name + " - " + reportData.zone.name,
                        "url": "https://www.warcraftlogs.com/reports/" + reportData.code,
                        "timestamp": timestamp.toISOString(),
                        "footer": {
                            "text": "Uploaded by " + reportData.owner.name
                        }
                    }
                ]
            }).then(()=> {
                //write to file
                fs.appendFileSync(fileName, `${logTimestamp.toLocaleString()} - ${reportData.code} - ${reportData.guildTag.name}\n`)
            }).catch(error => console.error(logTimestamp.toLocaleString(), error.message))
        }
    });
}