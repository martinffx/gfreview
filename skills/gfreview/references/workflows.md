# gfreview Workflows

## Scenario 1: Review a PR from scratch

1. gfreview view 42                    # Understand PR context
2. gfreview diff 42                    # Read the diff with line numbers
3. gfreview review start 42            # Start review session
4. gfreview review comment 42 --file src/foo.ts --line 15 --body "Consider using const here"
5. gfreview review comment 42 --file src/bar.ts --line 23 --body "This function is getting complex, consider extracting"
6. gfreview review status 42           # Check pending comments
7. gfreview review submit 42 --body "Overall looks good, minor suggestions"
8. gfreview discussions 42             # Verify comments were posted

## Scenario 2: Address feedback on a PR

1. gfreview view 42                    # Understand PR context
2. gfreview diff 42                    # See what changed
3. gfreview review start 42            # Start new review session
4. gfreview review comment 42 --file src/utils.ts --line 8 --body "Fixed per feedback"
5. gfreview review status 42           # Check pending comments
6. gfreview review submit 42            # Post response comments
7. gfreview discussions 42             # Verify

## Scenario 3: Post a single inline comment

1. gfreview review start 42
2. gfreview review comment 42 --file src/app.ts --line 42 --body "Nice fix!"
3. gfreview review submit 42

## Scenario 4: Handle stale review (PR updated)

If submit fails with stale SHA error:
- Option 1: gfreview review refresh 42  # Re-map comments to new diff
- Option 2: gfreview review discard 42    # Start fresh, comments lost
