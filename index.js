const Github = require('github')
const express = require('express')
const bodyParser = require('body-parser')

// Setup express app
const app = express()
app.use(bodyParser.json())

// Setup github api client
const github = new Github()
github.authenticate({
  type: "token",
  token: process.env.GH_TOKEN
});

app.post('/commit', function (req, res, next) {
  const payload = Object.freeze(req.body)
  const repository = payload.repository

  github.repos.getContent({
    owner: repository.owner.login,
    repo: repository.name,
    path: 'package.json'
  }, function (err, pkg) {
    if (err) {
      return next(err)
    }

    console.log(JSON.stringify(pkg, null, 4))
    res.status(202).json({})
  })
})

app.listen(process.env.PORT || 3000)