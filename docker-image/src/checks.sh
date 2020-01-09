#!/bin/sh

echo "checking preconditions..."

checks_failed=0

check_failed()
{
  checks_failed=$((checks_failed + 1))
}
check_if_writable()
{
  # checks if the given dir is writable, if it exists
  # it's ok if the dir does not exist at all, because it will be created
  # during solid server startup then and have the correct permissions
  dir=$1
  if [ -d "${dir}" ]; then
    if [ -w "${dir}" ]; then
      echo "✓ ${dir} is accessible by $(whoami)"
    else
      echo "✗ ${dir} not writable by $(whoami)"
      check_failed
    fi
  fi
}

check_if_file_readable()
{
  # checks if the given file exists and is readable
  file=$1
  if [ -e "${file}" ]; then
    if [ -r "${file}" ]; then
      echo "✓ ${file} is accessible by $(whoami)"
    else
      echo "✗ ${file} not readable by $(whoami)"
      check_failed
    fi
  else
    echo "✗ ${file} does not exist"
    check_failed
  fi
}

check_if_writable "${SOLID_HOME}/config"
check_if_writable "${SOLID_HOME}/data"
check_if_writable "${SOLID_HOME}/.db"
check_if_file_readable "${SOLID_SSL_KEY}"
check_if_file_readable "${SOLID_SSL_CERT}"

if [ "$checks_failed" -gt 0 ]; then
  echo "Finished: ERROR"
  exit 1
else
  echo "Finished: SUCCESS"
  exit 0;
fi
