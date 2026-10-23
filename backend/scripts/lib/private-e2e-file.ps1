param(
  [Parameter(Mandatory=$true)][string]$Target,
  [Parameter(Mandatory=$true)][ValidateSet('inspect','secure','write')][string]$Action
)
$ErrorActionPreference = 'Stop'
$temporaryDirectory = $null
$temporaryFile = $null
try {
  $Target = [System.IO.Path]::GetFullPath($Target)
  if ([System.IO.Directory]::Exists($Target)) { throw 'Target must be a regular file.' }
  $exists = [System.IO.File]::Exists($Target)
  if ($exists -and (([System.IO.File]::GetAttributes($Target) -band [System.IO.FileAttributes]::ReparsePoint) -ne 0)) {
    throw 'Reparse points are not supported.'
  }
  if ($exists) {
    $owner = [System.IO.File]::GetAccessControl($Target).GetOwner([System.Security.Principal.SecurityIdentifier])
  } else {
    $owner = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
  }
  $allowed = @($owner.Value, 'S-1-5-18', 'S-1-5-32-544') | Select-Object -Unique
  $fileSecurity = New-Object System.Security.AccessControl.FileSecurity
  # Change only the DACL. Writing an unchanged owner would unnecessarily
  # require WRITE_OWNER, which an owner with inherited Modify may not have.
  $fileSecurity.SetAccessRuleProtection($true, $false)
  foreach ($sid in $allowed) {
    $identity = New-Object System.Security.Principal.SecurityIdentifier($sid)
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($identity, 'FullControl', 'Allow')
    $fileSecurity.AddAccessRule($rule)
  }
  if ($Action -eq 'secure') {
    if (-not $exists) { throw 'Existing file required.' }
    [System.IO.File]::SetAccessControl($Target, $fileSecurity)
  }
  if ($Action -eq 'write') {
    # Create the staging directory atomically with a private DACL. No secret is
    # written until this directory exists with its explicit protection.
    $parent = [System.IO.Path]::GetDirectoryName($Target)
    $temporaryDirectory = [System.IO.Path]::Combine($parent, '.e2e-private-' + [guid]::NewGuid().ToString('N'))
    $directorySecurity = New-Object System.Security.AccessControl.DirectorySecurity
    $directorySecurity.SetAccessRuleProtection($true, $false)
    foreach ($sid in $allowed) {
      $identity = New-Object System.Security.Principal.SecurityIdentifier($sid)
      $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($identity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
      $directorySecurity.AddAccessRule($rule)
    }
    [void][System.IO.Directory]::CreateDirectory($temporaryDirectory, $directorySecurity)
    $temporaryFile = [System.IO.Path]::Combine($temporaryDirectory, 'environment')
    [Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
    $contents = [Console]::In.ReadToEnd()
    [System.IO.File]::WriteAllText($temporaryFile, $contents, (New-Object System.Text.UTF8Encoding($false)))
    [System.IO.File]::SetAccessControl($temporaryFile, $fileSecurity)
    if ($exists) {
      # ReplaceFile preserves the destination DACL: secure it first as well.
      [System.IO.File]::SetAccessControl($Target, $fileSecurity)
      # Windows PowerShell converts a direct null string argument to an empty
      # path. Reflection supplies a genuine null: no backup of secret content.
      $replace = [System.IO.File].GetMethod('Replace', [type[]]@([string], [string], [string]))
      [void]$replace.Invoke($null, [object[]]@($temporaryFile, $Target, $null))
    } else {
      [System.IO.File]::Move($temporaryFile, $Target)
    }
  }
  $effective = [System.IO.File]::GetAccessControl($Target)
  $rules = $effective.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier])
  if ($Action -ne 'inspect') {
    if ($effective.GetOwner([System.Security.Principal.SecurityIdentifier]).Value -ne $owner.Value) { throw 'Unexpected owner change.' }
    if (-not $effective.AreAccessRulesProtected -or $rules.Count -ne $allowed.Count) { throw 'Private DACL verification failed.' }
    foreach ($rule in $rules) {
      if ($rule.IsInherited -or $rule.AccessControlType -ne 'Allow' -or $rule.FileSystemRights -ne 'FullControl' -or $rule.IdentityReference.Value -notin $allowed) {
        throw 'Unexpected access rule.'
      }
    }
  }
  # Metadata only. Secret contents never appear in stdout or command arguments.
  [Console]::WriteLine($effective.GetOwner([System.Security.Principal.SecurityIdentifier]).Value)
  [Console]::WriteLine($effective.AreAccessRulesProtected.ToString())
  foreach ($rule in $rules) {
    [Console]::WriteLine($rule.IdentityReference.Value + '|' + $rule.FileSystemRights + '|' + $rule.AccessControlType + '|' + $rule.IsInherited)
  }
} catch {
  [Console]::Error.WriteLine('Private E2E file operation failed: ' + $_.Exception.Message)
  exit 1
} finally {
  # Only these two generated paths are removed, never a recursive parent tree.
  if ($temporaryFile -and [System.IO.File]::Exists($temporaryFile)) { [System.IO.File]::Delete($temporaryFile) }
  if ($temporaryDirectory -and [System.IO.Directory]::Exists($temporaryDirectory)) { [System.IO.Directory]::Delete($temporaryDirectory) }
}
