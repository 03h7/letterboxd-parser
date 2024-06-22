import { launch } from 'puppeteer'

const LOG_PATH = 'log.txt'

const CORS_HEADERS = {
    headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'OPTIONS, POST',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
};

async function log(requestLog: string) {
    try {
        const logs = await Bun.file(LOG_PATH).text()
        await Bun.write(LOG_PATH, logs.concat(requestLog))
    } catch (error) {
        await Bun.write(LOG_PATH, ''.concat(requestLog))
    }
}

const server = Bun.serve({
    async fetch(req) {

        if (req.method === 'OPTIONS') {
            const res = new Response('Departed', CORS_HEADERS);
            return res;
        }

        const path = new URL(req.url).pathname

        if(req.method==='POST' && path === '/letterbox') {
            let user = ""
            let allParsedMovies = []
            let body = await req.json()

            if(body) { 
                user = body.user
            } else {
                log(`${new Date()} ${req.method} ${req.url} MISSING USER IN BODY\n`)
                return new Response('User parameter is missing', { status: 400, ...CORS_HEADERS })
            }

            const browser = await launch({ headless: true })
            const page = await browser.newPage()

            await page.goto(`https://letterboxd.com/${user}/films`, {waitUntil: 'networkidle0'})

            const doesUserExist = await page.evaluate(() => {
                const isError = document.getElementsByClassName('error').item(0)
                return true ? isError === null : false
            })

            if(!doesUserExist) {
                return Response.json('User does not exist', {status: 404, ...CORS_HEADERS })
            }

            try {
                const mainPageMoviesList = await page.evaluate(() => {
                    const moviesList = document.getElementsByClassName('poster-list').item(1)
                    return moviesList ? moviesList.textContent?.trim() : null
                })

                if(mainPageMoviesList) allParsedMovies.push(mainPageMoviesList)

                const lastPageNumber = await page.evaluate(() => {
                    let lastChildren
                    const paginationList = document.getElementsByClassName('paginate-pages').item(0)?.children.item(0)?.children

                    if(paginationList) lastChildren = paginationList[paginationList?.length - 1]
                    return lastChildren ? Number(lastChildren.textContent) : 2
                })

                for (let i = 2; i <= lastPageNumber; i++) {
                    await page.goto(`https://letterboxd.com/${user}/films/page/${i}`, {waitUntil: 'networkidle0'})

                    const otherPagesmoviesList = await page.evaluate(() => {
                        const otherMoviesList = document.getElementsByClassName('poster-list').item(1)
                        return otherMoviesList ? otherMoviesList.textContent?.trim() : null
                    })

                    if(otherPagesmoviesList) {
                        allParsedMovies.push(otherPagesmoviesList)
                    } 
                }

                await browser.close()
            } catch (error) {
                log(`\n${new Date()} ${req.method} ${req.url} ERROR: \n ${error} \n END OF ERROR\n`)
                return new Response('Internal Server Error', { status: 500, ...CORS_HEADERS })
            }

            log(`${new Date()} ${req.method} ${req.url} ${user} SUCCESS\n`)
            return Response.json(allParsedMovies, { status: 200, ...CORS_HEADERS })
        }

        return new Response('Page not found', { status: 404, ...CORS_HEADERS })
    },
    port: 5555,
})

console.log(`LWMP is online on port: ${server.port}`)
