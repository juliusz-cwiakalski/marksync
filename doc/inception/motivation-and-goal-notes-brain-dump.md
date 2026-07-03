## Overview

Below notes are transcripts from my voice notes about a problem that I want to solve with maksync-for-confluence tool.
Take into consideration that there might be some transcript mistakes, so be cautious and read between the lines if
needed.

## Brain dump

Alright, so I would like to solve a problem of a team that is git-native and AI-heavy and prefers to work with all the
knowledge in local git-tracked markdown files. But on the other hand it lives in a corporate environment where at least
some part of the the knowledge must be shared with other teams using confluence. And here there are a couple of
interesting problems that must be solved. So for example, the team is creating a document in Git, the tool would
synchronize that to confluence, and then some other person from the organization would modify some thinking that
confluence. then if the team would modify the document in Git and synchronize it, then those changes will be
overwritten. Therefore, it could lead to the loss of knowledge that was documented in Confluence. So the tooling should
detect these situations to avoid loss of information, inform the user and ask about how to resolve the conflict. And one
of the potential ways to resolve the conflict could be to like work a little bit like a git merging different branches
if we would be able to have a conversion mechanism that is reliably converting markdown to confluence and back then we
could convert back to the markdown the confluence page including the changes and then it would result in a diff so we We
could for example convert the confluence page that was generated before the person made the direct change in the
confluence and then afterwards. So with that we could create a patch and then we could apply this patch on the local git
file and then there could be a scenario when there is no conflict because maybe that part of the document was changed
that was not conflicting or if there is a conflict then patch would be applied with this standard git-like conflict
resolution mechanism so then both could be merged before the confluence page would be updated again the tooling should
use the confluence history a lot and use some kind of markers or git hash commits etc so then when we are synchronizing
in the history we know which changes in confluence are coming from the tool synchronization and which coming from the
native Confluence users.

Another problem that I would like to solve is that working with diagrams and AI is very convenient and effective when we
use text formats like Mermite or maybe PlantUML and other formats like that in the markdown documents. So those should
be rendered on synchronization to Confluence as an image and then attached as an image to the Confluence page. And then
the synchronization tool should detect changes only in the diagram code and store it as images in Confluence attachments
with some kind of a hash. And if it would detect a diagram change, it would regenerate it.

So ultimately the goal is to maximize efficiency of working with AI and documentation in an environment where Confluence
cannot be eliminated fully because of different organizational dependencies, policies, or whatever. So we want to give
all the involved parties the best of both worlds. So the Git Native team can stay with Git only and have an efficient
and robust way of synchronizing knowledge into Confluence, and the Confluence Native teams can still benefit from
knowledge delivered by the Git Native teams.

Also, the developer experience using this tool must be exceptional, it must be super easy to set up and configure. The
synchronization should be possible from local environment to workstation, but also it could be configured as a CI
pipeline step and could even be triggered automatically. So for example in case when there is no conflict detected the
whole publishing and synchronization could be done fully autonomously on the merged main branch of the documentation
repo for example. It must be possible to have some convenient configuration preferably in the YAML format that would
instruct the synchronization tool where to place each document. It should have different strategies possible like from
single documentation repo synchronized to multiple confluence spaces, synchronize some folder to a specific space or
also it should allow to reflect the folder structure in the confidence navigation structure or some sub folders only etc
so any different sorts of scenarios that different teams could have so to give an example imagine we have some
documentation that is relevant for the first level support for example the other part would be relevant for the the SRE
and maintainers of the solution that have different space in confluence, etc. So all sorts of scenarios must be handled
by the tool.

Considering the wide range of users, it must also be easy to run the tool on different operating systems. Windows,
Linux, and Mac OS must be flawlessly supported. Ideally, the distribution should be a single binary or something easy to
install and should be portable for any operating system. Also, it should be able to handle quite big repositories. It
should be smart enough to figure out what was synchronized when, so that the synchronization process only does what is
required and it doesn't have to fetch everything. For example, it should be able to search for the pages and just check
the modification timestamp, etc., and figure out that changes are required or not. It can use some local cache that
would be Git-ignored, for example, in the repo, and then each user would maintain its own cache of the resources and
Confluence.

Also, it's clearly a lot of tooling around Markdown to Confluence synchronization available out there. My motivation to
create my own is to address this very specific problem of having robust two-way synchronization, a mechanism that
prevents overwriting and losing the knowledge, also that mechanism that would allow to render and automatically
integrate the Mermaid diagrams even if the organization doesn't have the Confluence Mermaid plugins, so basically by
rendering and embedding images in confluence.

From a delivery perspective, I would like to use test-driven and behavior-driven development approach and
specification-driven approach as much as possible. So this project will be delivered as much as possible by AI
autonomously. So we must be very specific. We must choose the tooling that supports test-driven and behavior-driven
development so that AI could start with defining the expected behaviors and test cases and then implement a production
code and solution that fulfills those requirements. We would need to take different testing strategies, such as some
portion of unit tests, some portion probably the biggest one of the integration tests that would mock the Confluence
API, and some portion of real end-to-end tests. We could set up a test Confluence space only for testing purposes and
remove the Confluence pages from the space or create a new space for each test run around the suite and then remove the
space afterwards. This would ensure that the solution is robust and stable. We must also design it in a way that we can
quickly adapt to changing APIs from Confluence, so that in case the Confluence API changes, we can relatively quickly
adjust the code. We should support all possible authentication scenarios, so that it's as easy to set up as possible for
the users, who can choose any authentication mechanism that is preferred by them and applicable to their security
policies in the company. Therefore, we should not be blockers here.

Another great benefit would be a clear and easy-to-use CLI interface with well-organized commands, parameters, etc. so
that even if there is a need for the AI to configure the tooling, the synchronization process, do some gyres and analyze
them, etc., then the user could use AI and CLI mode to set up the synchronization or to inspect the synchronization
process. Also, the tooling could support making configuration through the CLI and not necessarily directly in the
configuration YAML. So both ways should be supported. Then, the AI could discover the API of the CLI easily and support
the user with setting up the synchronization as required.

What this project could also help with is to give reasons to the developers, managers, and other stakeholders in the
organization to move to Git with the documentation. And why move to Git? There are multiple benefits, starting with the
fact that documentation living close to the code is updated more frequently and it's just up to date. Outdated
documentation is just more harmful than lack of documentation. Also, the workflow of building the documentation is much
more powerful with Git because then we can go through the pull request and common code review and comments and
discussions in the pull request, which is far superior to Confluence editing. So the project should solve the problem of
how to do it, but also give the knowledge base and some article or how-to tutorials on how to efficiently build the
knowledge base in the Git repositories and README files.

Delivery framework: https://github.com/juliusz-cwiakalski/agentic-delivery-os (AODS).
It also contains huge knowledge base regarding documentation
management: https://github.com/juliusz-cwiakalski/agentic-delivery-os/blob/main/doc/documentation-handbook.md

Ideally, if possible, we should use some sort of Gherkin documentation format. So all the features would be documented
in detail in this given one then scenarios. And then Gherkin features would be implemented as tests of different levels
like integration, maybe end-to-end, maybe some unit. This is to be decided in detail, but ideally if we would be able to
deliver that and then AI would be able to deliver high-quality projects end-to-end as much autonomously as possible,
then it would be great. So the testability and automated quality gates are a must and super critical for this project
because I want to deliver it in a fast manner, fast pace but without compromising the quality and robustness. And by
quality I mean that it is effective without bugs but also secure as much as possible. So we must consider quality on all
aspects here.

For MVP phase we should deliver at least one way sync from Git/Markdown into Confluence. For second phase we should
define MLP (Minimum Lovalble Product) that covers exceptional developer experience and easy setup and configuration.
Details of both phases yet to be designed during project inception and roadmap building. The MVP and MLP scope should be
defined based on research marksync-category-leadership-strategy-report-2026-07-02.md
marksync-failure-premortem-and-anti-failure-playbook-2026-07-02.md

Yet another (selfish) goal is to build my personal brand as a person who is experienced in effective AI delivery, IT
projects management, building efficient processes and IT organizations etc. Also to connect with other IT experts and
network. Put links to my profile, something like below in the main readme: 

```text

## License

Open-source. See [LICENSE](LICENSE).

## Author

Maintained by Juliusz Ćwiąkalski. If you find this useful, follow me or drop by my homepage (blog + newsletter):

- LinkedIn: [@juliusz-cwiakalski](https://www.linkedin.com/in/juliusz-cwiakalski/)
- X: [@cwiakalski](https://x.com/cwiakalski)
- Website (blog + newsletter): https://www.cwiakalski.com
```
