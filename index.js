const async = require('async')
const Github = require('github')
const express = require('express')
const bodyParser = require('body-parser')
const semver = require('semver')
const fs = require('fs')
const path = require('path')
const exec = require('child_process').exec

const app = express()
app.use(bodyParser.json())
app.set('view engine', 'pug');
app.set('etag', false)

function noCache (req, res, next) {
  res.set('Connection', 'close')
  res.set('Cache-Control', 'private, no-cache, no-store, must-revalidate')
  res.set('Expires', '-1')
  res.set('Pragma', 'no-cache')
  next()
}

const cache = {}
app.get('/:owner/:repo', noCache, function (req, res, next) {
  const { owner, repo } = req.params
  const outdated = cache[req.path]

  if (!outdated) {
    return next()
  }

  const isOutdated = outdated.length
  const badgeName = isOutdated ? 'outdated' : 'uptodate'
  let badgePath = path.join(__dirname, './badges')
  badgePath = path.join(badgePath, badgeName) + '.svg'

  res.set('Content-Type', 'image/svg+xml')
  fs.createReadStream(badgePath).pipe(res)
})

app.get('/:owner/:repo/json', noCache, function (req, res, next) {
  const { owner, repo } = req.params
  const outdated = cache[`/${owner}/${repo}`]

  if (!outdated) {
    return next()
  }

  res.json(outdated)
})

app.get('/:owner/:repo/html', noCache, function (req, res, next) {
  const { owner, repo } = req.params
  const outdated = cache[`/${owner}/${repo}`]

  if (!outdated) {
    return next()
  }

  res.render('report', {
    owner,
    repo,
    outdated
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
    let dependencies = Object.assign({}, pkg.dependencies)
    dependencies = Object.assign(dependencies, pkg.devDependencies)

    async.mapValuesLimit(dependencies, 3, function (version, name, cb) {
      exec(`npm info ${name}@latest version`, function (err, latest) {
        if (err) {
          return cb(err)
        }

        cb(null, {
          name,
          current: version,
          latest: latest.trim()
        })
      })
    }, callback)
  }

  function filterOutdated (packages, callback) {
    const outdated = Object.keys(packages).map(function (pkg) {
      return packages[pkg]
    }).filter(function (pkg) {
      return !semver.satisfies(pkg.latest, pkg.current)
    })

    callback(null, outdated)
  }

  function setCache (outdated, cb) {
    cache[`/${owner}/${repo}`] = outdated
    cb(null, outdated)
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
  checkDependencies(repository.owner.name, repository.name)
})

app.listen(process.env.PORT || 3000)
