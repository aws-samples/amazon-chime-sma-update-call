 #!/bin/bash
if ! [ -x "$(command -v node)" ]; then
  echo 'Error: node is not installed.' >&2
  exit 1
fi
NODEVER="$(node --version)"
REQNODE="v12.0.0"
if ! [ "$(printf '%s\n' "$REQNODE" "$NODEVER" | sort -V | head -n1)" = "$REQNODE" ]; then 
    echo 'node must be version 12+'
    exit 1
fi
if ! [ -x "$(command -v npm)" ]; then
  echo 'Error: npm is not installed.' >&2
  exit 1
fi
if ! [ -x "$(command -v aws)" ]; then
  echo 'Error: aws is not installed.' >&2
  exit 1
fi
if ! [ -x "$(command -v cdk)" ]; then
  echo 'Error: cdk is not installed.' >&2
  exit 1
fi
if [ -f "cdk.context.json" ]; then
    echo ""
    echo "INFO: Removing cdk.context.json"
    rm cdk.context.json
else
    echo ""
    echo "INFO: cdk.context.json not present, nothing to remove"
fi
echo ""
echo "Installing Packages"
echo ""
yarn
echo ""
echo "Building CDK"
echo ""
echo ""
echo "Building Packages"
echo ""
yarn run build
echo ""
echo "Bootstrapping CDK"
echo ""
cdk bootstrap
echo ""
echo "Deploying CDK"
echo ""
cdk deploy -O client/src/cdk-outputs.json
echo ""
echo "Building client"
echo ""
pushd client
yarn
popd

