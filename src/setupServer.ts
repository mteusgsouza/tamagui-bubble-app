async function setup() {
  if (process.env.ONE_RENDER_MODE === 'ssg') {
    return
  } else {
    console.info(`[server] start (SHA: ${process.env.GIT_SHA})`)
  }
}

await setup()

export {}
