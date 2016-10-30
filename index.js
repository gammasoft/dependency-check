const express = require('express')
const bodyParser = require('body-parser')

const app = express()
app.use(bodyParser.json())

app.post('/commit', function (req, res, next) {
  const payload = Object.freeze(req.body)
  console.log(JSON.stringify(payload, null, 4))
  res.status(202).json({})
})

app.listen(process.env.PORT || 3000)