# Version-only semantic-release adapter

This repository releases a Ruby gem and uses `npmPublish:false`. The npm plugin is
needed only to prepare the package version before `tools/release --prepare` reads
it for the gemspec. The upstream npm plugin installs npm with vulnerable bundled
glob/minimatch copies even when publication is disabled.

The package override replaces that dependency with this local, explicitly limited
plugin. It updates the manifest and existing lockfile root versions, preserves the
other fields, and rejects npm publication, alternate package roots and tarballs.
It deliberately does not invoke npm or lifecycle scripts, and rejects manifests
with preversion/version/postversion hooks rather than silently skipping them.

If npm publication or version lifecycle hooks are needed, replace this adapter
with a patched upstream npm plugin and its integration checks first. Remove the
override once upstream npm no longer bundles the vulnerable dependencies.
