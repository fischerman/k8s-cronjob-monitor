const Api = require('kubernetes-client');
let api;
if(process.env.KUBECONFIG) {
    api = new Api.Api(Api.config.fromKubeconfig());
} else {
    api = new Api.Api(Api.config.getInCluster())
}

var moment = require('moment');
const batch = {
    kind: 'CronJob',
    apiVersion: 'batch/v2alpha1'
};
const job = {
    kind: 'Job',
    apiVersion: 'batch/v1'
};

const namespace = process.env.NAMESPACE;
const cronJobName = process.env.CRONJOB;

function print(err, result) {
    console.log(JSON.stringify(err || result, null, 2));
}

var express = require('express')
var middleware = require("express-opentracing").default;
var util = require('util');
cons = require('consolidate')

var app = express()

// install tracer
var jaeger = require('jaeger-client');
var opentracing = require('opentracing');
var initTracer = jaeger.initTracer;
// let reporter = new jaeger.RemoteReporter();
var config = {
    serviceName: 'nextcloud-backup-monitor',
    reporter: {
        agentHost: process.env.JAEGER_HOST
    }
};
var options = {
    logger: console
};
var tracer = initTracer(config, options);
app.use(middleware({tracer: tracer}));

if(process.env.ENABLE_ZIPKIN_INJECTOR) {
    let codec = new jaeger.ZipkinB3TextMapCodec({ urlEncoding: true });
    tracer.registerInjector(opentracing.FORMAT_HTTP_HEADERS, codec);
    tracer.registerExtractor(opentracing.FORMAT_HTTP_HEADERS, codec);
}

// assign the swig engine to .html files
app.engine('html', cons.twig);

// set .html as the default extension
app.set('view engine', 'html');
app.set('views', __dirname + '/views');
 
app.get('/api/json', function (req, res) {
    getBackupJobs((err, jobs) => {
        if(err)
            throw err;
        res.send(jobs)
    })
})

app.get('/', function (req, res) {
    console.log(util.inspect(req.headers, {depth: 3}))
    getBackupJobs((err, jobs) => {
        if(err)
            throw err;
        jobs.forEach((job) => {
            status = job.status;
            status.startTime = moment(status.startTime)
            status.startTimeF = status.startTime.format("dddd, MMMM Do YYYY, h:mm:ss a");
            if(status.completionTime) {
                status.completionTimeF = moment(status.completionTime).format("dddd, MMMM Do YYYY, h:mm:ss a");
                status.completed = true;
            } else {
                status.completedFalse;
            }
        });
        jobs.sort((a, b) => {
            return a.status.startTime.isBefore(b.status.startTime) ? 1 : -1;
        })
        res.render('jobs', {
            jobs
        });
    })
})
 
app.listen(3000)

function getBackupJobs(cb) {
    api.group(batch).namespaces(namespace).cronjob(cronJobName).get((err, cronJob) => {
        if(err) {
            cb(err);
        }
        api.group(job).namespaces(namespace).kind(job).get((err, jobs) => {
            if(err) {
                cb(err);
            }
            filteredJobs = jobs.items.filter((job) => {
                createdByString = job.metadata.annotations["kubernetes.io/created-by"];
                if(createdByString) {
                    createdBy = JSON.parse(createdByString);
                    return createdBy.reference.uid === cronJob.metadata.uid;
                }
                return false;
            })
            console.log(filteredJobs);
            cb(null, filteredJobs);
        });
    });
}


//api.group(job).namespaces('nextcloud').kind(job).get(print);