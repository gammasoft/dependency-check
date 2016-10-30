const async = require('async')
const Github = require('github')
const express = require('express')
const bodyParser = require('body-parser')
const semver = require('semver')
const request = require('request')
const exec = require('child_process').exec

const app = express()
app.use(bodyParser.json())

function getBadgeUrl ({subject, status, color }) {
  return 'https://img.shields.io/badge/' + [
    subject, status, color
  ].join('-') + '.svg'
}

function noop (returnValue) {
  return function (owner, repo, callback) {
    callback(null, returnValue)
  }
}

const cache = {}
app.get('/:owner/:repo', function (req, res, next) {
  const { owner, repo } = req.params
  const isOutdated = cache[req.path]
  let fn = noop(isOutdated)

  if (typeof isOutdated === 'undefined') {
    fn = checkDependencies
  }

  fn(owner, repo, function (err, isOutdated) {
    if (err) {
      return next(err)
    }

    const badgeUrl = getBadgeUrl({
      subject: 'dependencies',
      status: isOutdated ? 'outdated' : 'uptodate',
      color: isOutdated ? 'red' : 'brightgreen'
    })

    request(badgeUrl).pipe(res)
  })
})

function checkDependencies (owner, repo, callback) {
  function downloadPackage(callback) {
    const github = new Github()

    github.authenticate({
      type: 'token',
      token: process.env.GH_TOKEN
    })

    github.repos.getContent({
      owner: owner,
      repo: repo,
      path: 'package.json'
    }, callback)
  }

  function parsePackage(file, callback) {
    let pkg = new Buffer(file.content, file.encoding)
    pkg = pkg.toString('ascii')

    try {
      callback(null, JSON.parse(pkg))
    } catch(err) {
      callback(err)
    }
  }

  function getLatestVersions (pkg, callback) {
    async.mapValues(pkg.dependencies, function (version, name, cb) {
      exec(`npm info ${name}@latest version`, function (err, latest) {
        if (err) {
          return cb(err)
        }

        cb(null, {
          current: version,
          latest: latest.trim()
        })
      })
    }, callback)
  }

  function filterOutdated (packages, callback) {
    const outdated = Object.keys(packages).filter(function (pkg) {
      pkg = packages[pkg]
      return !semver.satisfies(pkg.latest, pkg.current)
    })

    callback(null, !!outdated.length)
  }

  function setCache (isOutdated, cb) {
    cache[`/${owner}/${repo}`] = isOutdated
    cb(null, isOutdated)
  }

  async.waterfall([
    downloadPackage,
    parsePackage,
    getLatestVersions,
    filterOutdated,
    setCache
  ], callback || function (err) {
    if (err) {
      console.log(err)
    }
  })
}

app.post('/commit', function (req, res, next) {
  res.status(202).json({})
  const repository = req.body.repository
  checkDependencies(repository.owner.login, repository.name)
})

app.listen(process.env.PORT || 3000)
