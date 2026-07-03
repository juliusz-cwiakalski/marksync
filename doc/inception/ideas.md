1. So the Marksync tool could offer some simple CLI to also view the Confluence that we have access to and it could
   offer
   for example listing the spaces, listing articles in the space etc. So something like a simple access that humans
   could
   use to verify if it works, what you see from the context of the token etc.
2. Close to finalization of MVP scope delivery we could setug CI/CD pipeline that could use dedicated real worls
   instance of Attlasian project where for the e2e test run the CI would create dedicated space, the tool woud run the
   tests of syncing etc and verify all works all the time. Also to improve the testing delivery the tool could deliver a
   cli commands to fetch the content of the pages so then we could have simple tests like:
    1. sync markdown pages
    2. fetch content from confluence
    3. compare results
3. the tool to fetch content could suport different formats (native or markdown) - this could be useful for testing
   scenarios but also for users that would like to be able to just fetch the confluence page content
4. cli makrsync tooling could support searching of confluence pages
5. we should have some suggested front matter section of mrakdown document for marksync - it could store things like
   reference, maybe last version synce etc (details to be defined)
6. the cli tooling should support simple adding of markdown page to the confluence and handling the frontmatter configs
   etc
