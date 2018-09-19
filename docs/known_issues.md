# Known Issues

The following list consists of open issues which I have identified during testing, but decided to ignore them (for now). These issues are either just not worth the effort or just happening w/in rather weird conditions. 

## Linebreaks for injected links when last line is empty
Sometimes linebreaks are missing between the links

## Compute Duration always below 12h
Order doesn't matter, we always substract the smaller from the larger. No order was on purpose, I think its better to just add a "+1" to add day breaks (you can then also add +2)