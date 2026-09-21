#!/bin/sh
set -eu

bucket="${S3_BUCKET:-tripforge-documents}"
web_origin="${TRIPFORGE_WEB_ORIGIN:-http://127.0.0.1:3100}"

if ! awslocal s3api head-bucket --bucket "$bucket" >/dev/null 2>&1; then
  awslocal s3api create-bucket --bucket "$bucket" >/dev/null
fi

cat > /tmp/tripforge-s3-cors.json <<EOF
{
  "CORSRules": [
    {
      "AllowedHeaders": ["Content-Type"],
      "AllowedMethods": ["PUT"],
      "AllowedOrigins": ["$web_origin"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 600
    }
  ]
}
EOF

awslocal s3api put-bucket-cors \
  --bucket "$bucket" \
  --cors-configuration file:///tmp/tripforge-s3-cors.json >/dev/null

awslocal s3api put-public-access-block \
  --bucket "$bucket" \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true \
  >/dev/null
