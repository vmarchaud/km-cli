
'use strict'

module.exports = class StatusCommand {
  constructor (opts) {
    this.km = opts.km
    this.cli = opts.cli
    this.strategy = opts.strategy

    // register the command
    this.cli
      .command('login', 'login to our service')
      .action(this.launch.bind(this))
    return this.cli
  }

  launch (args, opts) {
    console.log(`
    Hello !

    You will be redirected to our platform to login, you can login using Github/Google if you want !
    `)

    return setTimeout(_ => {
      return this.strategy._retrieveTokens((err, tokens) => {
        if (err) {
          console.error(`Oups, a error happened : ${err.message}`)
          process.exit(1)
        }
        // query both the user and all bucket
        Promise.all([ this.km.user.retrieve(), this.km.bucket.retrieveAll() ])
          .then(results => {
            let user = results[0].data
            console.log(`You succesfully logged as ${user.username} !`)
            let buckets = results[1].data
            if (buckets.length > 0) {
              return console.log(`You have access to ${buckets.length} buckets !`)
            }
            // we will create one if he doesnt have one already
            console.log(`It seems that you dont have any bucket to link your pm2 to, we will create one for you ..`)
            this.km.bucket.create({
              name: 'Node.JS Monitoring'
            }).then(res => {
              const bucket = res.data.bucket
              console.log(`Succesfully created a bucket !`)
              console.log(`To start using it, you should push data with :
                pm2 link ${bucket.secret_id} ${bucket.public_id}
              `)
              console.log(`You can also access our dedicated UI by going here :
                https://app.keymetrics.io/#/bucket/${bucket.id}/dashboard
              `)
            })
          }).catch(err => {
            console.error(`Oups, a error happened : ${err.message}`)
            return process.exit(1)
          })
      })
    }, 1000)
  }
}
