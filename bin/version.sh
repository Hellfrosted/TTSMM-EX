#!/bin/bash
set -euo pipefail

if [ $# -ge 1 ]; then
	incr_type=$1
	version=$(npm version "$incr_type" --no-git-tag-version)
	cd release/app
	npm version "$incr_type" --no-git-tag-version
	cd ../../
	git add -- package.json package-lock.json release/app/package.json release/app/package-lock.json
	git commit -m "Bump version to $version"
	git tag $version
else
	echo "MUST SUPPLY A VERSION INCREMENT TYPE"
fi
