const express = require('express')
const Datastore = require('@google-cloud/datastore')
const bodyParser = require('body-parser')
const request = require('request')
const jwt = require('express-jwt')
const jwksRsa = require('jwks-rsa')

const app = express()

const projectId = 'piemo-project'
const datastore = new Datastore({projectId:projectId})

const EXERCISES = 'exercises'
const WORKOUTS = 'workouts'

const uriPrefix = "https://piemo-project.appspot.com/"
const exerciseSelfUri = uriPrefix + "exercises/"
const workoutSelfUri = uriPrefix + "workouts/"

const exercisesRouter = express.Router()
const workoutsRouter = express.Router()
const login = express.Router()
const users = express.Router()

app.use(bodyParser.json())

function fromDatastore(item) {
  item.id = item[Datastore.KEY].id
  return item
}

/* ------------- Begin Model Functions ------------- */

// ----- POST -----
function post_exercise(name, category, equipment, user) {
  var key = datastore.key(EXERCISES)
  const new_exercise = {
    "name": name,
    "category": category,
    "equipment": equipment,
    "user": user,
    "workout": null,
    "self": null
  }

  return datastore.save({"key":key, "data":new_exercise}).then(() => {return key})
}

function update_exercise(id, exercise, name, category, equipment) {
  const key = datastore.key([EXERCISES, parseInt(id,10)])
  const new_exercise = {
    "name": name,
    "category": category,
    "equipment": equipment,
    "user": exercise.user,
    "workout": exercise.workout,
    "self": exercise.self
  }

  return datastore.save({"key":key, "data":new_exercise}).then(() => {return key})
}

function set_self_exercise(id, uri, exercise) {
  const key = datastore.key([EXERCISES, parseInt(id,10)])
  const new_exercise = {
    "name": exercise.name,
    "category": exercise.category,
    "equipment": exercise.equipment,
    "user": exercise.user,
    "workout": exercise.workout,
    "self": uri + id
  }

  return datastore.save({"key":key, "data":new_exercise})
}

function update_exercise_workout(exercise, eid, wid) {
  const key = datastore.key([EXERCISES, parseInt(eid,10)])
  const new_exercise = {
    "name": exercise.name,
    "category": exercise.category,
    "equipment": exercise.equipment,
    "user": exercise.user,
    "workout": wid,
    "self": exercise.self
  }

  return datastore.save({"key":key, "data":new_exercise})
}

function remove_exercise_from_workout(eid, wid) {
  return get_resource(WORKOUTS, wid).then((workout) => {
    var w = workout[0]
    var i = w.exercises.indexOf(eid);
    if (i > -1) {
      w.exercises.splice(i, 1);
    }

    const key = datastore.key([WORKOUTS, parseInt(wid,10)])
    const new_workout = {
      "name": w.name,
      "category": w.category,
      "date": w.date,
      "user": w.user,
      "exercises": w.exercises,
      "self": w.self
    }

    return datastore.save({"key":key, "data":new_workout}).then(() => {return key})
  })
}

function post_workout(name, category, date, user) {
  var key = datastore.key(WORKOUTS)
  const new_workout = {
    "name": name,
    "category": category,
    "date": date,
    "user": user,
    "exercises": [],
    "self": null
  }

  return datastore.save({"key":key, "data":new_workout}).then(() => {return key})
}

function update_workout(id, workout, name, category, date) {
  const key = datastore.key([WORKOUTS, parseInt(id,10)])
  const new_workout = {
    "name": name,
    "category": category,
    "date": date,
    "user": workout.user,
    "exercises": workout.exercises,
    "self": workout.self
  }

  return datastore.save({"key":key, "data":new_workout}).then(() => {return key})
}

function set_self_workout(id, uri, workout) {
  const key = datastore.key([WORKOUTS, parseInt(id,10)])
  const new_workout = {
    "name": workout.name,
    "category": workout.category,
    "date": workout.date,
    "user": workout.user,
    "exercises": workout.exercises,
    "self": uri + id
  }

  return datastore.save({"key":key, "data":new_workout})
}

function update_workout_exercises(workout, wid, new_exercises) {
  const key = datastore.key([WORKOUTS, parseInt(wid,10)])
  const new_workout = {
    "name": workout.name,
    "category": workout.category,
    "date": workout.date,
    "user": workout.user,
    "exercises": new_exercises,
    "self": workout.self
  }

  return datastore.save({"key":key, "data":new_workout})
}

function remove_workout_from_exercise(wid, eid) {
  return get_resource(EXERCISES, eid).then((exercise) => {
    var e = exercise[0]

    const key = datastore.key([EXERCISES, parseInt(eid,10)])
    const new_exercise = {
      "name": e.name,
      "category": e.category,
      "equipment": e.equipment,
      "user": e.user,
      "workout": null,
      "self": e.self
    }

    return datastore.save({"key":key, "data":new_exercise}).then(() => {return key})
  })
}

// SHARED
function get_user_workouts(name) {
  const q = datastore.createQuery(WORKOUTS)

	return datastore.runQuery(q).then( (entities) => {
			return entities[0].map(fromDatastore).filter( item => item.user === name )
		})
}

// SHARED
function get_user_exercises(name) {
  const q = datastore.createQuery(WORKOUTS)

	return datastore.runQuery(q).then( (entities) => {
			return entities[0].map(fromDatastore).filter( item => item.user === name )
		})
}

// SHARED
function get_resource(ent, id) {
  const key = datastore.key([ent, parseInt(id,10)]);

  return datastore.get(key)
}

// SHARED
function get_entity(ent, req){
  var previous
  var prevNextPrefix = req.protocol + "://" + req.get("host") + req.baseUrl + "?cursor="

  var results = []

  var count = datastore.createQuery(ent)
  var q = datastore.createQuery(ent).limit(5)

  if(Object.keys(req.query).includes("cursor")) {
    previous = prevNextPrefix + req.query.cursor;
    q = q.start(req.query.cursor)
  }
  
  return datastore.runQuery(count).then((e) => {
    results.total = e[0].length

    return datastore.runQuery(q).then((entities) => {
      results.items = entities[0].map(fromDatastore)
  
      if(typeof previous != 'undefined') {
        results.previous = previous
      }
  
      if(entities[1].moreResults !== datastore.NO_MORE_RESULTS) {
        results.next = prevNextPrefix + entities[1].endCursor
      }
  
      return results
    })
  })
}

// SHARED
function delete_resource(ent, id) {
  const key = datastore.key([ent, parseInt(id,10)]);

  return datastore.delete(key)
}

// HELPER
const checkJwt = jwt({
  secret: jwksRsa.expressJwtSecret({
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 5,
    jwksUri: `https://piemo-project.auth0.com/.well-known/jwks.json`
  }),
  issuer: `https://piemo-project.auth0.com/`,
  algorithms: ['RS256']
})

/* ------------- End Model Functions ------------- */

/* ------------- Begin Controller Functions ------------- */

// ----- EXERCISES ------
exercisesRouter.get('/', checkJwt, function(req, res) {
  if(req.get('Accept') != 'application/json') {
    res.status(406).send("Not Acceptable")
  } else {
    get_entity(EXERCISES, req).then((exercises) => {
      res
        .status(200)
        .json({"total": exercises.total, "items": exercises.items, "next": exercises.next, "prev": exercises.previous})
        .end()
    })
  }
})

exercisesRouter.get('/:id', checkJwt, function(req, res) {
  var id = req.params.id

  if(req.get('Accept') != 'application/json') {
    res.status(406).send("Not Acceptable")
  } else {
    get_resource(EXERCISES, id).then((exercise) => {
      res.status(200).json(exercise).end()
    }, () => {
      res.status(404).end()
    })
  }
})

exercisesRouter.post('/', checkJwt, function(req, res) {
  if(req.get('content-type') !== 'application/json') {
    res.status(415).send('Server only accepts application/json data.')
  }

  post_exercise(req.body.name, req.body.category, req.body.equipment, req.user.name)
    .then(key => {
      get_resource(EXERCISES, key.id).then((exercise) => {
        set_self_exercise(key.id, exerciseSelfUri, exercise[0])
          res.location(req.protocol + "://" + req.get('host') + req.baseUrl + '/' + key.id);
          res.status(201).send('{ "id": ' + key.id + ' }')
      })
    })
})

exercisesRouter.put('/:id', checkJwt, function(req, res) {
  if(req.user) {
    get_resource(EXERCISES, req.params.id).then((exercise) => {
      var exercise = exercise[0]

      if(exercise.user === req.user.name) {
        update_exercise(req.params.id, exercise, req.body.name, req.body.category, req.body.equipment)
          .then(() => {
            res.status(204).end()
          }, () => {
            res.status(404).end()
          })
      } else {
        res.status(403).send('Forbidden')
      }
    })
  } else {
    res.status(401).send('Unauthorized')
  }
})

exercisesRouter.delete('/:id', checkJwt, function(req, res) {
  if(req.user) {
    get_resource(EXERCISES, req.params.id).then((exercises) => {
      var exercise = exercises[0]

      if(exercise.user === req.user.name) {
        if(exercise.workout != null) {
          remove_exercise_from_workout(req.params.id, exercise.workout).then(() => {
            delete_resource(EXERCISES, req.params.id)
              .then(() => {
                res.status(204).end()
              }, () => {
                res.status(404).end()
              })
          }, () => {
            delete_resource(EXERCISES, req.params.id)
              .then(() => {
                res.status(204).end()
              }, () => {
                res.status(404).end()
              })
          })
        } else {
          delete_resource(EXERCISES, req.params.id)
            .then(() => {
              res.status(204).end()
            }, () => {
              res.status(404).end()
            })
        }
      } else {
        res.status(403).send('Forbidden')
      }
    })
  } else {
    res.status(401).send('Unauthorized')
  }
})

exercisesRouter.put('/', function(req, res){
  res
    .status(405)
    .set("Allow", "GET")
    .send("Not Allowed")
})

exercisesRouter.delete('/', function(req, res){
  res
    .status(405)
    .set("Allow", "GET")
    .send("Not Allowed")
})

// ----- WORKOUTS ------
workoutsRouter.get('/', checkJwt, function(req, res) {
  if(req.get('Accept') != 'application/json') {
    res.status(406).send("Not Acceptable")
  } else {
    get_entity(WORKOUTS, req).then((workouts) => {
      res
        .status(200)
        .json({"total": workouts.total, "items": workouts.items, "next": workouts.next, "prev": workouts.previous})
        .end()
    })
  }
})

workoutsRouter.get('/:id', checkJwt, function(req, res) {
  var id = req.params.id

  if(req.get('Accept') != 'application/json') {
    res.status(406).send("Not Acceptable")
  } else {
    get_resource(WORKOUTS, id).then((workout) => {
      res.status(200).json(workout).end()
    }, () => {
      res.status(404).end()
    })
  }
})

workoutsRouter.post('/', checkJwt, function(req, res) {
  if(req.get('content-type') !== 'application/json') {
    res.status(415).send('Server only accepts application/json data.')
  }

  post_workout(req.body.name, req.body.category, req.body.date, req.user.name)
    .then(key => {
      get_resource(WORKOUTS, key.id).then((workout) => {
        set_self_workout(key.id, workoutSelfUri, workout[0])
          res.location(req.protocol + "://" + req.get('host') + req.baseUrl + '/' + key.id);
          res.status(201).send('{ "id": ' + key.id + ' }')
      })
    })
})

workoutsRouter.put('/:id', checkJwt, function(req, res) {
  if(req.user) {
    get_resource(WORKOUTS, req.params.id).then((workout) => {
      var workout = workout[0]

      if(workout.user === req.user.name) {
        update_workout(req.params.id, workout, req.body.name, req.body.category, req.body.date)
          .then(() => {
            res.status(204).end()
          }, () => {
            res.status(404).end()
          })
      } else {
        res.status(403).send('Forbidden')
      }
    })
  } else {
    res.status(401).send('Unauthorized')
  }
})

workoutsRouter.delete('/:id', checkJwt, function(req, res) {
  if(req.user) {
    get_resource(WORKOUTS, req.params.id).then((workouts) => {
      var workout = workouts[0]

      if(workout.user === req.user.name) {
        if(workout.exercises.length > 0) {
          remove_workout_from_exercise(req.params.id, workout.exercises[0]).then(() => {
            delete_resource(WORKOUTS, req.params.id)
              .then(() => {
                res.status(204).end()
              }, () => {
                res.status(404).end()
              })
          }, () => {
            res.status(404).end()
          })
        } else {
          delete_resource(WORKOUTS, req.params.id)
            .then(() => {
              res.status(204).end()
            }, () => {
              res.status(404).end()
            })
        }
      } else {
        res.status(403).send('Forbidden')
      }
    })
  } else {
    res.status(401).send('Unauthorized')
  }
})

workoutsRouter.put('/:wid/exercises/:eid', checkJwt, function(req, res) {
  if(req.user) {
    get_resource(WORKOUTS, req.params.wid).then((workouts) => {
      var workout = workouts[0]

      if(workout.user === req.user.name) {
        get_resource(EXERCISES, req.params.eid).then((exercises) => {
          var exercise = exercises[0]

          if(exercise.user === req.user.name) {
            var new_exercises

            if (workout.exercises == null) {
              new_exercise = [req.params.eid]
            } else {
              new_exercises = workout.exercises
              new_exercises.push(req.params.eid)
            }

            update_workout_exercises(workout, req.params.wid, new_exercises).then(() => {
              update_exercise_workout(exercise, req.params.eid, req.params.wid).then(() => {
                res.status(204).end()
              }, () => {
                res.status(404).end()
              })
            }, () => {
              res.status(404).end()
            })
    
          } else {
            res.status(403).send('Forbidden')
          }
        })

      } else {
        res.status(403).send('Forbidden')
      }
    })

  } else {
    res.status(401).send('Unauthorized')
  }
})

workoutsRouter.put('/', function(req, res){
  res
    .status(405)
    .set("Allow", "GET")
    .send("Not Allowed")
})

workoutsRouter.delete('/', function(req, res){
  res
    .status(405)
    .set("Allow", "GET")
    .send("Not Allowed")
})

// ----- USER ------
login.post('/', function(req, res) {
  const username = req.body.username
  const password = req.body.password

  var options = {
    method: 'POST',
    url: 'https://piemo-project.auth0.com/oauth/token',
    headers: { 'content-type': 'application/json' },
    body: {
      scope: 'openid profile',
      grant_type: 'password',
      username: username,
      password: password,
      audience: 'https://piemo-project.auth0.com/api/v2/',
      client_id: 'p_CJzbO80WMWnPPV1uvZpVbl_81A5Y3S',
      client_secret: 'S3b57o08dSWYdSorpQgCkhOCy6jX1GQlqCcziqJ7lNoLTKsOlAgQ2B94rOEQPr1D'
    },
    json: true
  }

  request(options, (error, response, body) => {
    if (error){
        res.status(500).send(error)
    } else {
        res.send(body)
    }
  })
})

users.get('/:id/exercises', checkJwt, function(req, res) {
  if(req.user.sub === req.params.id) {
    get_user_exercises(req.user.name)
      .then((exercises) => {
        const accepts = req.accepts(['application/json'])

        if(!accepts){
          res.status(406).send('Not Acceptable')
        } else if(accepts === 'application/json'){
          res.status(200).json(exercises)
        } else { 
          res.status(500).send('Content type got messed up!')
        }
    })
  } else {
    res.status(403).send('Forbidden')
  }
})

users.get('/:id/workouts', checkJwt, function(req, res) {
  if(req.user.sub === req.params.id) {
    get_user_workouts(req.user.name)
      .then((workouts) => {
        const accepts = req.accepts(['application/json'])

        if(!accepts){
          res.status(406).send('Not Acceptable')
        } else if(accepts === 'application/json'){
          res.status(200).json(workouts)
        } else { 
          res.status(500).send('Content type got messed up!')
        }
    })
  } else {
    res.status(403).send('Forbidden')
  }
})

/* ------------- End Controller Functions ------------- */

app.use('/exercises', exercisesRouter)
app.use('/workouts', workoutsRouter)
app.use('/login', login)
app.use('/users', users)

// Listen to the App Engine-specified port, or 8080 otherwise
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}...`)
})