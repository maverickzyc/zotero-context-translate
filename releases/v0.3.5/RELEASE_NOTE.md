# Zotero Context Translate 0.3.5

This release repairs MinerU paragraph boundaries before translation and prevents
narrative connectors such as `Though` and `While` from being hidden inside
citation placeholders.

For a previously completed paper, open the Context Translate workbench and use
“修复结构并补译”. The plugin will merge detected sentence fragments, retranslate
only the affected blocks, and update the existing bilingual HTML attachment.

The three script-free bilingual templates now place their language controls in
a dedicated side rail on wide reader windows. Narrow windows use a static top
row so the controls do not cover the paper text.
