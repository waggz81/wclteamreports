
const axios = require('axios');
const fs = require('fs');

const {client_id, secret} = require('./auth.json');
let argv = require('yargs/yargs')(process.argv.slice(2))
    .usage('Usage: $0 --guildID [numeric guild id] --guildTagID [numeric tag ID] --startTime [unix timestamp] --webhook [url]')
    .demandOption(['guildID','guildTagID', 'startTime', 'webhook'])
    .argv;

let bearerToken;
let fileName = './processedReports';

fs.closeSync(fs.openSync(fileName, 'a'));

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
        console.error(error);
    }
};

const setToken = async () => {
    await getToken()
        .then(response => {
            bearerToken = response.data.access_token;
        })
        .catch(error => {
            console.error(error.message)
        });
};


setToken().then(function () {
    fetchList();
});

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
        for (let report in results.data) postToDiscord(results.data[report]);

    }).catch(error => {
        console.error(error.message);
    })


}

function postToDiscord (reportData) {
    let timestamp = new Date(reportData.startTime);

    fs.readFile(fileName, function (err, data) {
        if (err) throw err;
        if(data.includes(reportData.code)){
            console.log(reportData.code, " already sent!");
            return false;
        }
        else {
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
                fs.appendFileSync(fileName, reportData.code + "\n")
            }).catch(error => console.error(error.message))
        }
    });
}