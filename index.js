const async = require('async')
const Github = require('github')
const express = require('express')
const bodyParser = require('body-parser')

// Setup express app
const app = express()
app.use(bodyParser.json())

// Setup github api client
const github = new Github()
github.authenticate({
  type: 'token',
  token: process.env.GH_TOKEN
});

app.post('/commit', function (req, res, next) {
  const payload = Object.freeze(req.body)
  const repository = payload.repository

  function downloadPackage(cb) {
    github.repos.getContent({
      owner: repository.owner.login,
      repo: repository.name,
      path: 'package.json'
    }, cb)
  }

  function parsePackage(file, cb) {
    let pkg = new Buffer(file.content, file.encoding)
    pkg = pkg.toString('ascii')

    try {
      cb(null, JSON.parse(pkg))
    } catch(err) {
      cb(err)
    }
  }

  async.waterfall([
    downloadPackage,
    parsePackage
  ], function (err, pkg) {
    if (err) {
      return next(err)
    }

    res.status(202).json(pkg)
  })
})

app.listen(process.env.PORT || 3000)