To whom it may concern

Playground is a web development environment built on top of connected [Automerge](https://automerge.org/) documents.
To make the editing experience more ergonomic - all blocks/apps are dynamically created as web components and editable directly in the UI.
A good example of the syntax for a block is the [World](https://github.com/PlaygroundNow/Playground-2.0/blob/main/blocks/world-block.html).
The file is plain HTML and a single root element + <script /> + <style /> form the web component. A write-up of what and why Playground is can be
read on the homepage https://playground.now/. Within the Playground environment, which has been my personal scratchpad for the last year and a half
there are a few experiments in UI editing. The library block is a sort of SmallTtalk code editor for the browser. The cell block is a draggable
spreadsheet cell. The [1.0 version](https://github.com/PlaygroundNow/Playground) implemented a process manager and capability for running Deno scripts
that are authored on the front end. The current version has a data table component. I built a Swift library and created a mobile app where you can drag
and snap blocks that get rendered natively.

<img width="512" height="321" alt="image" src="https://github.com/user-attachments/assets/39720c9e-1db9-45c6-860b-11f4f396bd32" />

All of these fun experiments were a way to strech my legs and push myself to get ideas out of my head and onto the screen. The utility of them in this state
is about 0. I'm chasing the dragon - there's no doubt - to get a glimpse of what Alan Kay meant by object oriented, and what David Ungar meant when he said you
bang on the objects and they bang back. This repo is a bit of a backwards approach. SmallTalk and Self were environments that started with a simple powerful
idea that allowed complex and useful behavior to emerge. Playground is built from a myriad of complex tools where not-so-useful behavior is strapped together.
I'm now diving deeper into compilers to better understand how programming lanugages work. I think that will give me a better perspective on what this mysterious
better way might be.

Best,

Ryan
